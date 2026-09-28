import React, { useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Spinner, Progress, useToastContext } from '@librechat/client';
import type { TUsageResetStatus } from 'librechat-data-provider';
import { useClaimUsageResetMutation } from '~/data-provider';
import { useLocalize, useClockFormat } from '~/hooks';

interface UsageResetsProps {
  tokenCredits: number;
  resets: TUsageResetStatus;
}

const toPercent = (value: number, total: number): number =>
  total > 0 ? Math.min(100, Math.max(0, Math.round((value / total) * 100))) : 0;

/** Refetches the balance once the oldest reset in the window frees up. */
function useRefreshAt(isoDate?: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isoDate) {
      return;
    }
    const delay = new Date(isoDate).getTime() - Date.now();
    if (delay <= 0) {
      return;
    }
    const refresh = () => queryClient.invalidateQueries([QueryKeys.balance]);
    const timer = setTimeout(refresh, delay + 1000);
    return () => clearTimeout(timer);
  }, [isoDate, queryClient]);
}

export default function UsageResets({ tokenCredits, resets }: UsageResetsProps) {
  const localize = useLocalize();
  const hour12 = useClockFormat();
  const { showToast } = useToastContext();
  const claimReset = useClaimUsageResetMutation();
  useRefreshAt(resets.nextAvailableAt);

  const { allotment, perDay, dailyRemaining, bonus, nextAvailableAt, canReset } = resets;
  const available = dailyRemaining + bonus;
  const percentLeft = toPercent(tokenCredits, allotment);
  const isFull = tokenCredits >= allotment;
  const nextDate = nextAvailableAt
    ? new Date(nextAvailableAt).toLocaleString(undefined, {
        hour12,
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;

  const handleReset = () => {
    claimReset.mutate(undefined, {
      onSuccess: ({ source }) => {
        const key =
          source === 'bonus' ? 'com_nav_usage_reset_success_bonus' : 'com_nav_usage_reset_success';
        showToast({ status: 'success', message: localize(key) });
      },
      onError: () => showToast({ status: 'error', message: localize('com_nav_usage_reset_error') }),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-text-primary">
            {localize('com_nav_usage_allotment')}
          </div>
          <div className="text-xs text-text-secondary">
            {localize('com_nav_usage_allotment_detail', {
              0: Math.max(0, tokenCredits).toLocaleString(undefined, { maximumFractionDigits: 0 }),
              1: allotment.toLocaleString(),
            })}
          </div>
        </div>
        <div className="flex w-full items-center gap-3 sm:w-1/2">
          <Progress
            value={percentLeft}
            className="flex-1"
            aria-label={localize('com_nav_usage_allotment')}
          />
          <span className="whitespace-nowrap text-sm text-text-secondary">
            {localize('com_nav_usage_percent_left', { 0: percentLeft })}
          </span>
        </div>
      </div>

      <div className="space-y-3 border-t border-border-light pt-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-text-primary">
            {localize('com_nav_usage_resets')}
          </span>
          <span
            className="rounded-full bg-surface-tertiary px-2.5 py-0.5 text-xs font-medium text-text-primary"
            role="status"
          >
            {localize('com_nav_usage_resets_available', { 0: available })}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 space-y-0.5">
            <div className="text-sm text-text-primary">
              {localize('com_nav_usage_reset_full', { 0: allotment.toLocaleString() })}
            </div>
            <div className="text-xs text-text-secondary">
              {localize('com_nav_usage_resets_daily', { 0: dailyRemaining, 1: perDay })}
              {bonus > 0 && ` · ${localize('com_nav_usage_resets_bonus', { 0: bonus })}`}
            </div>
            {nextDate && dailyRemaining < perDay && (
              <div className="text-xs text-text-secondary">
                {localize('com_nav_usage_resets_next', { 0: nextDate })}
              </div>
            )}
            {isFull && available > 0 && (
              <div className="text-xs text-text-secondary">
                {localize('com_nav_usage_resets_full')}
              </div>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleReset}
            disabled={!canReset || claimReset.isLoading}
            aria-label={localize('com_nav_usage_reset_use')}
            className="shrink-0 gap-1.5"
          >
            {claimReset.isLoading ? (
              <Spinner className="size-4" />
            ) : (
              <RotateCcw className="size-4" aria-hidden="true" />
            )}
            {localize('com_nav_usage_reset_use')}
          </Button>
        </div>
      </div>
    </div>
  );
}
