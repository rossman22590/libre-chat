import { useState } from 'react';
import { Skeleton } from '@librechat/client';
import type { TUsageModelStat } from 'librechat-data-provider';
import { formatCompact, formatRelative, percentOf, splitModel } from './format';
import { useUsageSummaryQuery } from '~/data-provider';
import { PERIOD_LABELS } from './Spending';
import { useUsagePeriod } from './hooks';
import { useLocalize } from '~/hooks';
import ErrorState from './ErrorState';

/** Ranked shades of one hue: the palette stays theme-driven while ranks stay distinguishable */
const SHADES = [0.95, 0.72, 0.52, 0.36, 0.24];
const OTHER_SHADE = 0.14;
const COLLAPSED_COUNT = 5;

const shadeAt = (index: number) => SHADES[index] ?? OTHER_SHADE;

function ModelName({ model }: { model: string }) {
  const { provider, name } = splitModel(model);
  return (
    <span className="min-w-0 truncate">
      {provider && <span className="text-text-secondary">{provider}/</span>}
      <span className="font-medium text-text-primary">{name}</span>
    </span>
  );
}

interface ModelRowProps {
  stat: TUsageModelStat;
  index: number;
  share: number;
  isMostUsed: boolean;
}

function ModelRow({ stat, index, share, isMostUsed }: ModelRowProps) {
  const localize = useLocalize();
  const perMessage = stat.messageCount > 0 ? stat.spentCredits / stat.messageCount : 0;
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span
        className="mt-1.5 size-2.5 shrink-0 rounded-sm bg-surface-inverted"
        style={{ opacity: shadeAt(index) }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <ModelName model={stat.model} />
          {index === 0 && (
            <span className="shrink-0 rounded-full bg-surface-tertiary px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
              {localize('com_nav_usage_top_spend')}
            </span>
          )}
          {isMostUsed && (
            <span className="shrink-0 rounded-full bg-status-info-subtle px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-status-info">
              {localize('com_nav_usage_most_used')}
            </span>
          )}
        </div>
        <div className="text-xs tabular-nums text-text-secondary">
          {localize('com_nav_usage_model_detail', {
            0: formatCompact(stat.messageCount),
            1: formatCompact(stat.inputTokens),
            2: formatCompact(stat.outputTokens),
          })}
        </div>
        <div className="text-xs tabular-nums text-text-secondary">
          {localize('com_nav_usage_per_message', { 0: formatCompact(perMessage) })}
          {' · '}
          {localize('com_nav_usage_last_used', { 0: formatRelative(stat.lastUsedAt) })}
        </div>
      </div>
      <div className="shrink-0 text-right tabular-nums">
        <div className="font-medium text-text-primary">{formatCompact(stat.spentCredits)}</div>
        <div className="text-xs text-text-secondary">
          {localize('com_nav_usage_share', { 0: Math.round(share) })}
        </div>
      </div>
    </li>
  );
}

export default function Models() {
  const localize = useLocalize();
  const [days] = useUsagePeriod();
  const { data, isLoading, isError, refetch } = useUsageSummaryQuery(days);
  const [expanded, setExpanded] = useState(false);

  if (isError && !data) {
    return <ErrorState onRetry={() => refetch()} />;
  }
  if (isLoading || !data) {
    return <Skeleton className="h-40 rounded-lg" />;
  }

  const { models } = data;
  if (models.length === 0) {
    return (
      <p className="py-2 text-sm text-text-secondary">
        {localize('com_nav_usage_no_models', { 0: localize(PERIOD_LABELS[days]).toLowerCase() })}
      </p>
    );
  }

  const total = models.reduce((sum, m) => sum + m.spentCredits, 0);
  const mostUsed = models.reduce((top, m) => (m.messageCount > top.messageCount ? m : top));
  const visible = expanded ? models : models.slice(0, COLLAPSED_COUNT);

  return (
    <div className="space-y-2">
      <div
        className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full"
        role="img"
        aria-label={localize('com_nav_usage_model_share')}
      >
        {models.map((stat, index) => (
          <span
            key={stat.model}
            className="h-full bg-surface-inverted first:rounded-l-full last:rounded-r-full"
            style={{ width: `${percentOf(stat.spentCredits, total)}%`, opacity: shadeAt(index) }}
            title={`${stat.model}: ${Math.round(percentOf(stat.spentCredits, total))}%`}
          />
        ))}
      </div>
      <ul className="divide-y divide-border-light">
        {visible.map((stat, index) => (
          <ModelRow
            key={stat.model}
            stat={stat}
            index={index}
            share={percentOf(stat.spentCredits, total)}
            isMostUsed={stat === mostUsed && index !== 0}
          />
        ))}
      </ul>
      {models.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="text-xs font-medium text-text-secondary hover:text-text-primary"
        >
          {expanded
            ? localize('com_nav_usage_show_less')
            : localize('com_nav_usage_show_all', { 0: models.length })}
        </button>
      )}
    </div>
  );
}
