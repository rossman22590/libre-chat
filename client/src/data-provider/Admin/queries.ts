import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { TAdminUsersResponse } from 'librechat-data-provider';

export const useGetAdminUsers = (params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  enabled?: boolean;
}) => {
  const { page = 1, pageSize = 20, search = '', enabled = true } = params ?? {};
  return useQuery<TAdminUsersResponse>(
    [QueryKeys.adminUsers, page, pageSize, search],
    () => dataService.getAdminUsers({ page, pageSize, search }),
    { enabled },
  );
};
