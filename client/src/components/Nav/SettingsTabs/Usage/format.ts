const compact = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const whole = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

export const formatCompact = (value: number): string => compact.format(Math.round(value));

export const formatWhole = (value: number): string => whole.format(value);

export function formatRelative(iso: string, now: number = Date.now()): string {
  const seconds = (new Date(iso).getTime() - now) / 1000;
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(seconds) >= size) {
      return relative.format(Math.round(seconds / size), unit);
    }
  }
  return relative.format(0, 'minute');
}

/** Splits `provider/model` ids so the provider can be de-emphasized */
export function splitModel(model: string): { provider?: string; name: string } {
  const index = model.lastIndexOf('/');
  if (index <= 0) {
    return { name: model };
  }
  return { provider: model.slice(0, index), name: model.slice(index + 1) };
}

export const percentOf = (value: number, total: number): number =>
  total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;
