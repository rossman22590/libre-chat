import { useAtom } from 'jotai';
import type { TBalanceResponse, TUsagePeriodDays } from 'librechat-data-provider';
import { useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import { usagePeriodAtom } from '~/store/billing';
import { useAuthContext } from '~/hooks';

export function useBalance(): Partial<TBalanceResponse> {
  const { isAuthenticated } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && !!startupConfig?.balance?.enabled,
  });
  return balanceQuery.data ?? {};
}

export function useUsagePeriod(): [TUsagePeriodDays, (days: TUsagePeriodDays) => void] {
  return useAtom(usagePeriodAtom);
}
