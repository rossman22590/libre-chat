import { resolveUsageResetConfig, getUsageResetStatus } from './resets';

const HOUR = 60 * 60 * 1000;
const settings = { allotment: 200000, perDay: 2, windowHours: 24, windowMs: 24 * HOUR };

describe('resolveUsageResetConfig', () => {
  it('returns null unless balance and resets are both enabled', () => {
    expect(resolveUsageResetConfig({ enabled: false, resets: { enabled: true } })).toBeNull();
    expect(resolveUsageResetConfig({ enabled: true, resets: { enabled: false } })).toBeNull();
    expect(resolveUsageResetConfig({ enabled: true })).toBeNull();
  });

  it('falls back to startBalance and defaults', () => {
    expect(
      resolveUsageResetConfig({ enabled: true, startBalance: 5000, resets: { enabled: true } }),
    ).toEqual({ allotment: 5000, perDay: 2, windowHours: 24, windowMs: 24 * HOUR });
  });
});

describe('getUsageResetStatus', () => {
  const now = Date.parse('2026-01-02T12:00:00Z');

  it('counts only resets inside the window and reports when the oldest frees up', () => {
    const recent = new Date(now - 2 * HOUR);
    const expired = new Date(now - 25 * HOUR);
    const status = getUsageResetStatus(
      { tokenCredits: 10, usageResets: [expired, recent], bonusResets: 1 },
      settings,
      now,
    );
    expect(status).toMatchObject({ dailyRemaining: 1, bonus: 1, canReset: true });
    expect(status.nextAvailableAt).toBe(new Date(recent.getTime() + 24 * HOUR).toISOString());
  });

  it('disallows resets at or above the allotment or with none left', () => {
    expect(getUsageResetStatus({ tokenCredits: 200000 }, settings, now).canReset).toBe(false);
    const used = [new Date(now - HOUR), new Date(now - 2 * HOUR)];
    const exhausted = getUsageResetStatus({ tokenCredits: 0, usageResets: used }, settings, now);
    expect(exhausted.canReset).toBe(false);
    expect(getUsageResetStatus(null, settings, now).canReset).toBe(false);
  });
});
