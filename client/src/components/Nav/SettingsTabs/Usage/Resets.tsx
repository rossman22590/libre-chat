import { useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Spinner, useToastContext } from '@librechat/client';
import { useClaimUsageResetMutation } from '~/data-provider';
import { useLocalize, useClockFormat } from '~/hooks';
import { formatWhole } from './format';
import { useBalance } from './hooks';

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

export default function Resets() {
  const localize = useLocalize();
  const hour12 = useClockFormat();
  const { showToast } = useToastContext();
  const claimReset = useClaimUsageResetMutation();
  const { tokenCredits = 0, resets } = useBalance();
  useRefreshAt(resets?.nextAvailableAt);

  if (!resets) {
    return null;
  }

  const { allotment, perDay, dailyRemaining, bonus, nextAvailableAt, canReset } = resets;
  const available = dailyRemaining + bonus;
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
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-text-primary">{localize('com_nav_usage_resets')}</span>
          <span
            className={
              available > 0
                ? 'rounded-full bg-status-success-subtle px-2 py-0.5 text-xs font-medium text-status-success'
                : 'rounded-full bg-surface-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary'
            }
            role="status"
          >
            {localize('com_nav_usage_resets_available', { 0: available })}
          </span>
        </div>
        <div className="text-xs text-text-secondary">
          {localize('com_nav_usage_reset_full', { 0: formatWhole(allotment) })}
        </div>
        <div className="text-xs text-text-secondary">
          {localize('com_nav_usage_resets_daily', { 0: dailyRemaining, 1: perDay })}
          {bonus > 0 && ` · ${localize('com_nav_usage_resets_bonus', { 0: bonus })}`}
          {nextDate &&
            dailyRemaining < perDay &&
            ` · ${localize('com_nav_usage_resets_next', { 0: nextDate })}`}
        </div>
        {isFull && available > 0 && (
          <div className="text-xs text-text-secondary">{localize('com_nav_usage_resets_full')}</div>
        )}
      </div>
      <Button
        type="button"
        size="sm"
        onClick={handleReset}
        disabled={!canReset || claimReset.isLoading}
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
  );
}
