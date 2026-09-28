import React, { useMemo, useState } from 'react';
import { Button, Skeleton, Spinner } from '@librechat/client';
import { Plus, Type, RotateCcw, RefreshCw, ShieldCheck, MessageSquare } from 'lucide-react';
import type { TUsageActivityItem, TUsageActivityKind } from 'librechat-data-provider';
import type { LucideIcon } from 'lucide-react';
import type { TranslationKeys } from '~/hooks';
import { formatCompact, formatWhole, splitModel } from './format';
import { useUsageActivityQuery } from '~/data-provider';
import { useLocalize, useClockFormat } from '~/hooks';
import { GRANT_LABELS } from './Spending';
import ErrorState from './ErrorState';

const FILTERS: { kind: TUsageActivityKind; labelKey: TranslationKeys }[] = [
  { kind: 'all', labelKey: 'com_nav_usage_filter_all' },
  { kind: 'spent', labelKey: 'com_nav_usage_filter_spent' },
  { kind: 'added', labelKey: 'com_nav_usage_filter_added' },
];

const CONTEXT_ICONS: Record<string, LucideIcon> = {
  admin: ShieldCheck,
  autoRefill: RefreshCw,
  usageReset: RotateCcw,
  title: Type,
};

const CHAT_CONTEXT_LABELS: Record<string, TranslationKeys> = {
  title: 'com_nav_balance_transaction_context_title',
  incomplete: 'com_nav_balance_transaction_context_incomplete',
};

interface DayGroup {
  key: string;
  label: string;
  items: TUsageActivityItem[];
}

function dayLabel(date: Date, today: Date, localize: ReturnType<typeof useLocalize>): string {
  const diff = Math.round((today.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
  if (diff === 0) {
    return localize('com_ui_date_today');
  }
  if (diff === 1) {
    return localize('com_ui_date_yesterday');
  }
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

function useDayGroups(items: TUsageActivityItem[]): DayGroup[] {
  const localize = useLocalize();
  return useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return items.reduce<DayGroup[]>((groups, item) => {
      const day = new Date(item.createdAt);
      day.setHours(0, 0, 0, 0);
      const key = day.toDateString();
      const last = groups[groups.length - 1];
      if (last?.key === key) {
        last.items.push(item);
        return groups;
      }
      groups.push({ key, label: dayLabel(day, today, localize), items: [item] });
      return groups;
    }, []);
  }, [items, localize]);
}

function ActivityRow({ item }: { item: TUsageActivityItem }) {
  const localize = useLocalize();
  const hour12 = useClockFormat();
  const isCredit = item.type === 'credit';
  const context = item.context ?? '';
  const Icon = CONTEXT_ICONS[context] ?? (isCredit ? Plus : MessageSquare);
  const time = new Date(item.createdAt).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12,
  });

  const grantKey = GRANT_LABELS[context];
  const chatContextKey = CHAT_CONTEXT_LABELS[context];
  const chatFallback = chatContextKey ?? 'com_nav_usage_untitled_chat';
  const creditLabel = grantKey ? localize(grantKey) : context;
  const title = isCredit
    ? creditLabel || localize('com_nav_usage_credits_added')
    : (item.title ?? localize(chatFallback));

  const details = [time, ...item.models.map((m) => splitModel(m).name)];
  if (!isCredit) {
    details.push(
      localize('com_nav_usage_tokens_split', {
        0: formatCompact(item.inputTokens),
        1: formatCompact(item.outputTokens),
      }),
    );
    if (item.cachedTokens > 0) {
      details.push(localize('com_nav_usage_cached', { 0: formatCompact(item.cachedTokens) }));
    }
  }

  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
          isCredit
            ? 'bg-status-success-subtle text-status-success'
            : 'bg-surface-secondary text-text-secondary'
        }`}
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-text-primary">{title}</div>
        <div className="truncate text-xs tabular-nums text-text-secondary">
          {details.join(' · ')}
        </div>
      </div>
      <div className="shrink-0 text-right tabular-nums">
        {isCredit ? (
          <div
            className="font-medium text-status-success"
            aria-label={localize('com_nav_balance_transaction_credits_added')}
          >
            +{formatWhole(item.addedCredits)}
          </div>
        ) : (
          <div
            className="font-medium text-text-primary"
            aria-label={localize('com_nav_balance_transaction_credits_spent')}
          >
            −{formatWhole(item.spentCredits)}
          </div>
        )}
        <div className="text-xs text-text-secondary">
          {localize('com_nav_usage_credits')}
        </div>
      </div>
    </li>
  );
}

export default function Activity() {
  const localize = useLocalize();
  const [kind, setKind] = useState<TUsageActivityKind>('all');
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useUsageActivityQuery(kind);
  const items = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
  const groups = useDayGroups(items);

  const filters = (
    <div
      className="inline-flex rounded-lg bg-surface-secondary p-0.5"
      role="group"
      aria-label={localize('com_nav_usage_filter')}
    >
      {FILTERS.map((filter) => (
        <button
          key={filter.kind}
          type="button"
          onClick={() => setKind(filter.kind)}
          aria-pressed={kind === filter.kind}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary ${
            kind === filter.kind
              ? 'bg-surface-primary text-text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          {localize(filter.labelKey)}
        </button>
      ))}
    </div>
  );

  let body: React.ReactNode;
  if (isError && items.length === 0) {
    body = <ErrorState onRetry={() => refetch()} />;
  } else if (isLoading) {
    body = (
      <div className="space-y-2" role="status" aria-label={localize('com_ui_loading')}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    );
  } else if (items.length === 0) {
    body = (
      <p className="py-2 text-sm text-text-secondary">{localize('com_nav_usage_no_activity')}</p>
    );
  } else {
    body = (
      <div className="space-y-3">
        {groups.map((group) => (
          <section key={group.key} aria-label={group.label}>
            <h4 className="sticky top-0 z-[1] bg-surface-dialog py-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
              {group.label}
            </h4>
            <ul className="divide-y divide-border-light">
              {group.items.map((item) => (
                <ActivityRow key={`${item.type}-${item.id}`} item={item} />
              ))}
            </ul>
          </section>
        ))}
        {hasNextPage && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? (
              <Spinner className="size-4" />
            ) : (
              localize('com_nav_usage_load_more')
            )}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filters}
      {body}
    </div>
  );
}
