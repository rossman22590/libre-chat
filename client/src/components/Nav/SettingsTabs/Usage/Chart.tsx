import { useMemo, useState } from 'react';
import type { TUsageSeriesPoint } from 'librechat-data-provider';
import { formatCompact, formatUsd, formatWhole } from './format';
import { useLocalize, useClockFormat } from '~/hooks';

interface ChartProps {
  series: TUsageSeriesPoint[];
  since: string;
  granularity: 'hour' | 'day';
}

interface Bucket {
  key: string;
  date: Date;
  spentCredits: number;
  addedCredits: number;
}

const HOUR_MS = 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');

function bucketKey(date: Date, granularity: ChartProps['granularity']): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return granularity === 'hour' ? `${day}T${pad(date.getHours())}` : day;
}

/** Every bucket from `since` to now in local time, so empty days still render as gaps. */
function buildBuckets(
  series: TUsageSeriesPoint[],
  since: string,
  granularity: ChartProps['granularity'],
): Bucket[] {
  const byKey = new Map(series.map((p) => [p.bucket, p]));
  const cursor = new Date(since);
  if (granularity === 'hour') {
    cursor.setMinutes(0, 0, 0);
  } else {
    cursor.setHours(0, 0, 0, 0);
  }
  const buckets: Bucket[] = [];
  const now = Date.now();
  while (cursor.getTime() <= now) {
    const key = bucketKey(cursor, granularity);
    const point = byKey.get(key);
    buckets.push({
      key,
      date: new Date(cursor),
      spentCredits: point?.spentCredits ?? 0,
      addedCredits: point?.addedCredits ?? 0,
    });
    if (granularity === 'hour') {
      cursor.setTime(cursor.getTime() + HOUR_MS);
    } else {
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return buckets;
}

export default function Chart({ series, since, granularity }: ChartProps) {
  const localize = useLocalize();
  const hour12 = useClockFormat();
  const buckets = useMemo(
    () => buildBuckets(series, since, granularity),
    [series, since, granularity],
  );
  const [active, setActive] = useState<number | null>(null);
  const peak = buckets.reduce((max, b) => Math.max(max, b.spentCredits), 0);
  const focused = buckets[active ?? buckets.length - 1];

  const formatBucket = (date: Date) =>
    granularity === 'hour'
      ? date.toLocaleTimeString(undefined, { hour: 'numeric', hour12 })
      : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const axisLabels = [
    buckets[0],
    buckets[Math.floor(buckets.length / 2)],
    buckets[buckets.length - 1],
  ];

  return (
    <div className="space-y-2">
      <div
        className="flex min-h-[2.25rem] items-end justify-between gap-3 text-xs"
        aria-live="polite"
      >
        {focused && (
          <div className="min-w-0">
            <div className="text-text-secondary">{formatBucket(focused.date)}</div>
            <div className="tabular-nums text-text-primary">
              <span className="font-medium">{formatWhole(focused.spentCredits)}</span>{' '}
              {localize('com_nav_usage_credits_spent')} · {formatUsd(focused.spentCredits)}
              {focused.addedCredits > 0 && (
                <span className="text-status-success">
                  {' · '}+{formatCompact(focused.addedCredits)} {localize('com_nav_usage_added')}
                </span>
              )}
            </div>
          </div>
        )}
        <span className="shrink-0 tabular-nums text-text-secondary">
          {localize('com_nav_usage_peak', { 0: formatCompact(peak) })}
        </span>
      </div>

      <div
        className="flex h-28 items-end gap-[2px]"
        role="group"
        aria-label={localize('com_nav_usage_chart_label')}
        onMouseLeave={() => setActive(null)}
      >
        {buckets.map((bucket, index) => {
          const height = peak > 0 ? (bucket.spentCredits / peak) * 100 : 0;
          const dimmed = active != null && active !== index;
          return (
            <button
              key={bucket.key}
              type="button"
              className="group relative flex h-full min-w-0 flex-1 cursor-default flex-col justify-end rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
              onMouseEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              aria-label={`${formatBucket(bucket.date)}: ${formatWhole(bucket.spentCredits)} ${localize('com_nav_usage_credits_spent')}`}
            >
              <span
                className={
                  bucket.spentCredits > 0
                    ? 'w-full rounded-t-sm bg-surface-inverted transition-opacity motion-reduce:transition-none'
                    : 'h-[2px] w-full rounded-sm bg-surface-tertiary'
                }
                style={
                  bucket.spentCredits > 0
                    ? { height: `max(${height}%, 3px)`, opacity: dimmed ? 0.35 : 0.9 }
                    : undefined
                }
              />
              {bucket.addedCredits > 0 && (
                <span
                  className="absolute -bottom-2 left-1/2 size-1 -translate-x-1/2 rounded-full bg-status-success"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex justify-between pt-1 text-[11px] tabular-nums text-text-secondary">
        {axisLabels.map((bucket, index) => (
          <span key={`${bucket?.key}-${index}`}>{bucket ? formatBucket(bucket.date) : ''}</span>
        ))}
      </div>
    </div>
  );
}
