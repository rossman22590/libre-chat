import AutoRefillSettings from '../SettingsTabs/Balance/AutoRefillSettings';
import { useBalance } from '../SettingsTabs/Usage/hooks';
import { useLocalize } from '~/hooks';

export function AutoRefill() {
  const localize = useLocalize();
  const {
    autoRefillEnabled = false,
    lastRefill,
    refillAmount,
    refillIntervalUnit,
    refillIntervalValue,
  } = useBalance();

  const hasValidRefillSettings =
    lastRefill !== undefined &&
    refillAmount !== undefined &&
    refillIntervalUnit !== undefined &&
    refillIntervalValue !== undefined;

  if (!autoRefillEnabled) {
    return (
      <div className="text-sm text-text-secondary">
        {localize('com_nav_balance_auto_refill_disabled')}
      </div>
    );
  }

  if (!hasValidRefillSettings) {
    return (
      <div className="text-sm text-text-destructive">
        {localize('com_nav_balance_auto_refill_error')}
      </div>
    );
  }

  return (
    <AutoRefillSettings
      lastRefill={lastRefill}
      refillAmount={refillAmount}
      refillIntervalUnit={refillIntervalUnit}
      refillIntervalValue={refillIntervalValue}
    />
  );
}
