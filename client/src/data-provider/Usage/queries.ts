import { useRecoilValue } from 'recoil';
import { QueryKeys, dataService } from 'librechat-data-provider';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import type { QueryObserverResult, UseInfiniteQueryResult } from '@tanstack/react-query';
import type t from 'librechat-data-provider';
import store from '~/store';

const ACTIVITY_PAGE_SIZE = 25;

const getTimeZone = (): string | undefined => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

export const useUsageSummaryQuery = (
  days: t.TUsagePeriodDays,
): QueryObserverResult<t.TUsageSummaryResponse> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  const tz = getTimeZone();
  return useQuery<t.TUsageSummaryResponse>(
    [QueryKeys.usageSummary, days, tz],
    () => dataService.getUsageSummary({ days, tz }),
    {
      enabled: queriesEnabled,
      keepPreviousData: true,
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    },
  );
};

export const useUsageActivityQuery = (
  kind: t.TUsageActivityKind,
): UseInfiniteQueryResult<t.TUsageActivityResponse> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useInfiniteQuery<t.TUsageActivityResponse>({
    queryKey: [QueryKeys.usageActivity, kind],
    queryFn: ({ pageParam }) =>
      dataService.getUsageActivity({
        kind,
        before: typeof pageParam === 'string' ? pageParam : undefined,
        limit: ACTIVITY_PAGE_SIZE,
      }),
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    enabled: queriesEnabled,
    keepPreviousData: true,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
