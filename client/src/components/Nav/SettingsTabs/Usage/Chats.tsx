import { Link } from 'react-router-dom';
import { Skeleton } from '@librechat/client';
import { formatCompact, formatRelative, formatUsd, splitModel } from './format';
import { useUsageSummaryQuery } from '~/data-provider';
import { PERIOD_LABELS } from './Spending';
import { useUsagePeriod } from './hooks';
import { useLocalize } from '~/hooks';
import ErrorState from './ErrorState';

export default function Chats() {
  const localize = useLocalize();
  const [days] = useUsagePeriod();
  const { data, isLoading, isError, refetch } = useUsageSummaryQuery(days);

  if (isError && !data) {
    return <ErrorState onRetry={() => refetch()} />;
  }
  if (isLoading || !data) {
    return <Skeleton className="h-32 rounded-lg" />;
  }
  if (data.chats.length === 0) {
    return (
      <p className="py-2 text-sm text-text-secondary">
        {localize('com_nav_usage_no_chats', { 0: localize(PERIOD_LABELS[days]).toLowerCase() })}
      </p>
    );
  }

  const top = data.chats[0].spentCredits;

  return (
    <ol className="divide-y divide-border-light">
      {data.chats.map((chat, index) => (
        <li key={chat.conversationId}>
          <Link
            to={`/c/${encodeURIComponent(chat.conversationId)}`}
            className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
          >
            <span className="w-4 shrink-0 text-center text-xs tabular-nums text-text-secondary">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="truncate font-medium text-text-primary">
                {chat.title ?? localize('com_nav_usage_untitled_chat')}
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-surface-tertiary">
                <div
                  className="h-full rounded-full bg-surface-inverted opacity-80"
                  style={{ width: `${top > 0 ? (chat.spentCredits / top) * 100 : 0}%` }}
                />
              </div>
              <div className="truncate text-xs tabular-nums text-text-secondary">
                {localize('com_nav_usage_chat_detail', {
                  0: formatCompact(chat.messageCount),
                  1: chat.topModel ? splitModel(chat.topModel).name : '—',
                  2: formatRelative(chat.lastActiveAt),
                })}
              </div>
            </div>
            <div className="shrink-0 text-right tabular-nums">
              <div className="font-medium text-text-primary">
                {formatCompact(chat.spentCredits)}
              </div>
              <div className="text-xs text-text-secondary">{formatUsd(chat.spentCredits)}</div>
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}
