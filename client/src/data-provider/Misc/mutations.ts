import { useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, MutationKeys, dataService } from 'librechat-data-provider';
import type { UseMutationResult } from '@tanstack/react-query';
import type t from 'librechat-data-provider';

export const useClaimUsageResetMutation = (): UseMutationResult<
  t.TUsageResetResponse,
  unknown,
  void
> => {
  const queryClient = useQueryClient();
  return useMutation([MutationKeys.claimUsageReset], () => dataService.claimUsageReset(), {
    onSuccess: ({ tokenCredits, resets }) => {
      queryClient.setQueryData<t.TBalanceResponse>([QueryKeys.balance], (prev) =>
        prev ? { ...prev, tokenCredits, resets } : prev,
      );
      queryClient.invalidateQueries([QueryKeys.balanceTransactions]);
      queryClient.invalidateQueries([QueryKeys.usageSummary]);
      queryClient.invalidateQueries([QueryKeys.usageActivity]);
    },
    onError: () => {
      queryClient.invalidateQueries([QueryKeys.balance]);
    },
  });
};
