import { Progress } from '@librechat/client';
import { formatCompact, formatUsd, formatWhole, percentOf } from './format';
import { useLocalize } from '~/hooks';
import { useBalance } from './hooks';

export default function Overview() {
  const localize = useLocalize();
  const { tokenCredits = 0, resets } = useBalance();
  const credits = Math.max(0, tokenCredits);
  const allotment = resets?.allotment;
  const percentLeft = allotment ? Math.round(percentOf(credits, allotment)) : null;

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 py-1">
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-text-secondary">
          {localize('com_nav_usage_balance')}
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums tracking-tight text-text-primary">
            {formatWhole(credits)}
          </span>
          <span className="text-sm text-text-secondary">{localize('com_nav_usage_credits')}</span>
        </div>
        <div className="mt-0.5 text-xs tabular-nums text-text-secondary">
          {localize('com_nav_usage_approx_usd', { 0: formatUsd(credits) })}
        </div>
      </div>
      {allotment != null && percentLeft != null && (
        <div className="w-full sm:w-64">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-text-secondary">
            <span>{localize('com_nav_usage_of_allotment', { 0: formatCompact(allotment) })}</span>
            <span className="tabular-nums">
              {localize('com_nav_usage_percent_left', { 0: percentLeft })}
            </span>
          </div>
          <Progress value={percentLeft} aria-label={localize('com_nav_usage_allotment')} />
        </div>
      )}
    </div>
  );
}
