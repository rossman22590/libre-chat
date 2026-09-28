import { logger, isValidObjectIdString } from '@librechat/data-schemas';
import type { BalanceConfig, IBalance, UsageResetClaim } from '@librechat/data-schemas';
import type { TUsageResetStatus } from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_PER_DAY = 2;
const DEFAULT_WINDOW_HOURS = 24;
const MAX_GRANT = 100;

export interface UsageResetSettings {
  allotment: number;
  perDay: number;
  windowHours: number;
  windowMs: number;
}

type ResetRecord = Pick<IBalance, 'tokenCredits' | 'usageResets' | 'bonusResets'>;

type BalanceLocals = {
  balanceData?: IBalance | null;
  balanceConfig?: BalanceConfig | null;
};

export interface UsageResetDeps {
  claimUsageReset: (params: {
    user: string;
    allotment: number;
    perDay: number;
    windowMs: number;
  }) => Promise<UsageResetClaim | null>;
}

export interface GrantUsageResetsDeps {
  grantUsageResets: (user: string, amount: number) => Promise<IBalance | null>;
}

export interface GrantAllUsageResetsDeps {
  grantUsageResetsToAll: (amount: number) => Promise<number>;
}

function parseGrantAmount(body: unknown): number | null {
  const amount = Number((body as { amount?: number | string } | undefined)?.amount);
  return Number.isInteger(amount) && amount !== 0 && Math.abs(amount) <= MAX_GRANT ? amount : null;
}

/** Resolves reset settings from the effective balance config; `null` when resets are off. */
export function resolveUsageResetConfig(
  balanceConfig?: BalanceConfig | null,
): UsageResetSettings | null {
  const resets = balanceConfig?.resets;
  if (!balanceConfig?.enabled || !resets?.enabled) {
    return null;
  }
  const allotment = resets.allotment ?? balanceConfig.startBalance;
  if (allotment == null || allotment <= 0) {
    return null;
  }
  const windowHours = resets.windowHours ?? DEFAULT_WINDOW_HOURS;
  return {
    allotment,
    perDay: resets.perDay ?? DEFAULT_PER_DAY,
    windowHours,
    windowMs: windowHours * HOUR_MS,
  };
}

export function getUsageResetStatus(
  record: ResetRecord | null | undefined,
  settings: UsageResetSettings,
  now: number = Date.now(),
): TUsageResetStatus {
  const cutoff = now - settings.windowMs;
  let used = 0;
  let oldest = Infinity;
  for (const date of record?.usageResets ?? []) {
    const time = new Date(date).getTime();
    if (time < cutoff) {
      continue;
    }
    used++;
    oldest = Math.min(oldest, time);
  }

  const dailyRemaining = Math.max(0, settings.perDay - used);
  const bonus = record?.bonusResets ?? 0;
  const belowAllotment = record != null && record.tokenCredits < settings.allotment;

  return {
    allotment: settings.allotment,
    perDay: settings.perDay,
    windowHours: settings.windowHours,
    dailyRemaining,
    bonus,
    nextAvailableAt:
      oldest === Infinity ? undefined : new Date(oldest + settings.windowMs).toISOString(),
    canReset: belowAllotment && dailyRemaining + bonus > 0,
  };
}

/** Reset status for the balance response, or `undefined` when resets are disabled. */
export function buildUsageResetStatus(
  balanceConfig: BalanceConfig | null | undefined,
  record: ResetRecord | null | undefined,
): TUsageResetStatus | undefined {
  const settings = resolveUsageResetConfig(balanceConfig);
  return settings ? getUsageResetStatus(record, settings) : undefined;
}

/**
 * `POST /api/balance/reset` — expects `createSetBalanceConfig` to run first so the user's
 * role-scoped balance config and record are on `res.locals`.
 */
export function createUsageResetHandler({ claimUsageReset }: UsageResetDeps) {
  return async (req: ServerRequest, res: Response): Promise<void> => {
    const locals = res.locals as BalanceLocals;
    const settings = resolveUsageResetConfig(locals.balanceConfig);
    if (!settings) {
      res.status(403).json({ error: 'Usage resets are not enabled' });
      return;
    }

    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    try {
      const result = await claimUsageReset({
        user: userId,
        allotment: settings.allotment,
        perDay: settings.perDay,
        windowMs: settings.windowMs,
      });
      if (!result) {
        res.status(409).json({
          error: 'No usage reset available',
          resets: getUsageResetStatus(locals.balanceData, settings),
        });
        return;
      }
      res.status(200).json({
        tokenCredits: result.balance.tokenCredits,
        source: result.source,
        resets: getUsageResetStatus(result.balance, settings),
      });
    } catch (error) {
      logger.error('[usageReset] Failed to reset balance:', error);
      res.status(500).json({ error: 'Failed to reset balance' });
    }
  };
}

/** `POST /api/admin/users/:userId/resets` — grants bonus resets; a negative amount revokes. */
export function createGrantUsageResetsHandler({ grantUsageResets }: GrantUsageResetsDeps) {
  return async (req: ServerRequest, res: Response): Promise<void> => {
    const { userId } = req.params as { userId: string };
    const amount = parseGrantAmount(req.body);
    if (!isValidObjectIdString(userId)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }
    if (amount == null) {
      res.status(400).json({ error: `Amount must be a non-zero integer up to ${MAX_GRANT}` });
      return;
    }

    try {
      const balance = await grantUsageResets(userId, amount);
      if (!balance) {
        res.status(404).json({ error: 'User has no balance record yet' });
        return;
      }
      res.status(200).json({ bonusResets: balance.bonusResets ?? 0 });
    } catch (error) {
      logger.error('[usageReset] Failed to grant resets:', error);
      res.status(500).json({ error: 'Failed to grant resets' });
    }
  };
}

/** `POST /api/admin/users/resets/grant-all` — shifts every user's bonus resets by `amount`. */
export function createGrantAllUsageResetsHandler({
  grantUsageResetsToAll,
}: GrantAllUsageResetsDeps) {
  return async (req: ServerRequest, res: Response): Promise<void> => {
    const amount = parseGrantAmount(req.body);
    if (amount == null) {
      res.status(400).json({ error: `Amount must be a non-zero integer up to ${MAX_GRANT}` });
      return;
    }

    try {
      const updatedCount = await grantUsageResetsToAll(amount);
      res.status(200).json({ updatedCount, amount });
    } catch (error) {
      logger.error('[usageReset] Failed to grant resets to all users:', error);
      res.status(500).json({ error: 'Failed to grant resets' });
    }
  };
}
