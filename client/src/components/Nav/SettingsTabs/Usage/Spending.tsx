import { Skeleton } from '@librechat/client';
import { USAGE_PERIOD_DAYS } from 'librechat-data-provider';
import type { TUsagePeriodDays, TUsageGrant } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import { formatCompact, formatWhole } from './format';
import { useUsageSummaryQuery } from '~/data-provider';
import { useUsagePeriod } from './hooks';
import { useLocalize } from '~/hooks';
import ErrorState from './ErrorState';
import Chart from './Chart';

export const PERIOD_LABELS: Record<TUsagePeriodDays, TranslationKeys> = {
  1: 'com_nav_usage_period_24h',
  7: 'com_nav_usage_period_7d',
  30: 'com_nav_usage_period_30d',
  90: 'com_nav_usage_period_90d',
};

const PERIOD_SHORT: Record<TUsagePeriodDays, string> = { 1: '24h', 7: '7d', 30: '30d', 90: '90d' };

export const GRANT_LABELS: Record<string, TranslationKeys> = {
  admin: 'com_nav_balance_transaction_context_admin',
  autoRefill: 'com_nav_balance_transaction_context_autoRefill',
  usageReset: 'com_nav_balance_transaction_context_usageReset',
};

interface TileProps {
  label: string;
  value: string;
  detail: string;
  tone?: 'default' | 'success';
}

function Tile({ label, value, detail, tone = 'default' }: TileProps) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-secondary px-3 py-2.5">
      <div className="truncate text-[11px] font-medium uppercase tracking-wide text-text-secondary">
        {label}
      </div>
      <div
        className={`mt-0.5 truncate text-lg font-semibold tabular-nums ${
          tone === 'success' ? 'text-status-success' : 'text-text-primary'
        }`}
      >
        {value}
      </div>
      <div className="truncate text-xs tabular-nums text-text-secondary">{detail}</div>
    </div>
  );
}

export function PeriodPicker() {
  const localize = useLocalize();
  const [days, setDays] = useUsagePeriod();
  return (
    <div
      className="inline-flex rounded-lg bg-surface-secondary p-0.5"
      role="group"
      aria-label={localize('com_nav_usage_period')}
    >
      {USAGE_PERIOD_DAYS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setDays(option)}
          aria-pressed={days === option}
          aria-label={localize(PERIOD_LABELS[option])}
          className={`rounded-md px-2.5 py-1 text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary ${
            days === option
              ? 'bg-surface-primary text-text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          {PERIOD_SHORT[option]}
        </button>
      ))}
    </div>
  );
}

function GrantChips({ grants }: { grants: TUsageGrant[] }) {
  const localize = useLocalize();
  if (grants.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {grants.map((grant) => {
        const key = GRANT_LABELS[grant.context];
        return (
          <span
            key={grant.context}
            className="inline-flex items-center gap-1.5 rounded-full border border-border-light px-2.5 py-1 text-xs"
          >
            <span className="size-1.5 rounded-full bg-status-success" aria-hidden="true" />
            <span className="text-text-primary">{key ? localize(key) : grant.context}</span>
            <span className="tabular-nums text-status-success">
              +{formatCompact(grant.credits)}
            </span>
            <span className="tabular-nums text-text-secondary">×{grant.count}</span>
          </span>
        );
      })}
    </div>
  );
}

export default function Spending() {
  const localize = useLocalize();
  const [days] = useUsagePeriod();
  const { data, isLoading, isError, refetch } = useUsageSummaryQuery(days);

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-text-secondary">{localize(PERIOD_LABELS[days])}</span>
      <PeriodPicker />
    </div>
  );

  if (isError && !data) {
    return (
      <div className="space-y-4">
        {header}
        <ErrorState onRetry={() => refetch()} />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4" role="status" aria-label={localize('com_ui_loading')}>
        {header}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[74px] rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-36 rounded-lg" />
      </div>
    );
  }

  const { totals, grants, series, since, granularity } = data;
  const totalTokens = totals.inputTokens + totals.outputTokens;
  const perMessage = totals.messageCount > 0 ? totals.spentCredits / totals.messageCount : 0;
  const grantCount = grants.reduce((sum, g) => sum + g.count, 0);

  return (
    <div className="space-y-4">
      {header}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile
          label={localize('com_nav_usage_spent')}
          value={formatCompact(totals.spentCredits)}
          detail={localize('com_nav_usage_avg_per_message', { 0: formatCompact(perMessage) })}
        />
        <Tile
          label={localize('com_nav_usage_added')}
          value={`+${formatCompact(totals.addedCredits)}`}
          detail={localize('com_nav_usage_grant_count', { 0: grantCount })}
          tone={totals.addedCredits > 0 ? 'success' : 'default'}
        />
        <Tile
          label={localize('com_nav_usage_messages')}
          value={formatWhole(totals.messageCount)}
          detail={localize('com_nav_usage_in_chats', { 0: formatWhole(totals.conversationCount) })}
        />
        <Tile
          label={localize('com_nav_usage_tokens')}
          value={formatCompact(totalTokens)}
          detail={localize('com_nav_usage_tokens_split', {
            0: formatCompact(totals.inputTokens),
            1: formatCompact(totals.outputTokens),
          })}
        />
      </div>
      <Chart series={series} since={since} granularity={granularity} />
      <GrantChips grants={grants} />
    </div>
  );
}
