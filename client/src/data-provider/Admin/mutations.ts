import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';

export const useSetAdminUserBalanceMutation = () => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ userId, amount }: { userId: string; amount: number }) =>
      dataService.setAdminUserBalance(userId, amount),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.adminUsers]);
      },
    },
  );
};

export const useBanAdminUserMutation = () => {
  const queryClient = useQueryClient();
  return useMutation(
    ({ userId, durationMinutes }: { userId: string; durationMinutes: number }) =>
      dataService.banAdminUser(userId, durationMinutes),
    {
      onSuccess: () => {
        queryClient.invalidateQueries([QueryKeys.adminUsers]);
      },
    },
  );
};

export const useUnbanAdminUserMutation = () => {
  const queryClient = useQueryClient();
  return useMutation((userId: string) => dataService.unbanAdminUser(userId), {
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.adminUsers]);
    },
  });
};
