import { logger } from '@librechat/data-schemas';
import { USAGE_PERIOD_DAYS } from 'librechat-data-provider';
import type {
  TUsageSummary,
  TUsagePeriodDays,
  TUsageActivityKind,
  TUsageActivityResponse,
} from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import type { BalanceRouteHandler } from './resets';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS: TUsagePeriodDays = 30;
const DEFAULT_ACTIVITY_LIMIT = 25;
const MAX_ACTIVITY_LIMIT = 50;
const ACTIVITY_KINDS: ReadonlySet<string> = new Set(['all', 'spent', 'added']);
const PERIOD_DAYS: ReadonlySet<number> = new Set(USAGE_PERIOD_DAYS);

export interface UsageDeps {
  getUsageSummary: (params: {
    user: string;
    since: Date;
    timezone: string;
    granularity: 'hour' | 'day';
  }) => Promise<TUsageSummary>;
  getUsageActivity: (params: {
    user: string;
    kind: TUsageActivityKind;
    before?: Date;
    limit: number;
  }) => Promise<TUsageActivityResponse>;
}

type UsageQuery = {
  days?: string;
  tz?: string;
  kind?: string;
  before?: string;
  limit?: string;
};

function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function parseDays(value?: string): TUsagePeriodDays {
  const days = Number(value);
  return PERIOD_DAYS.has(days) ? (days as TUsagePeriodDays) : DEFAULT_DAYS;
}

function parseLimit(value?: string): number {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit <= 0) {
    return DEFAULT_ACTIVITY_LIMIT;
  }
  return Math.min(limit, MAX_ACTIVITY_LIMIT);
}

export interface UsageHandlers {
  summary: BalanceRouteHandler;
  activity: BalanceRouteHandler;
}

/** `GET /api/balance/usage` and `GET /api/balance/activity` for the signed-in user. */
export function createUsageHandlers({
  getUsageSummary,
  getUsageActivity,
}: UsageDeps): UsageHandlers {
  async function summary(req: ServerRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const query = req.query as UsageQuery;
    const days = parseDays(query.days);
    const timezone = query.tz && isValidTimeZone(query.tz) ? query.tz : 'UTC';
    const granularity = days === 1 ? 'hour' : 'day';
    const since = new Date(Date.now() - days * DAY_MS);

    try {
      const result = await getUsageSummary({ user: userId, since, timezone, granularity });
      res.status(200).json({ ...result, days, since: since.toISOString(), granularity });
    } catch (error) {
      logger.error('[usage] Failed to load usage summary:', error);
      res.status(500).json({ error: 'Failed to load usage' });
    }
  }

  async function activity(req: ServerRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const query = req.query as UsageQuery;
    const kind = (
      query.kind && ACTIVITY_KINDS.has(query.kind) ? query.kind : 'all'
    ) as TUsageActivityKind;
    const before = query.before ? new Date(query.before) : undefined;
    if (before && isNaN(before.getTime())) {
      res.status(400).json({ error: 'Invalid cursor' });
      return;
    }

    try {
      const result = await getUsageActivity({
        user: userId,
        kind,
        before,
        limit: parseLimit(query.limit),
      });
      res.status(200).json(result);
    } catch (error) {
      logger.error('[usage] Failed to load usage activity:', error);
      res.status(500).json({ error: 'Failed to load activity' });
    }
  }

  return { summary, activity };
}
