import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type {
  TAdminUsersResponse,
  TAdminStatsResponse,
  TBalanceTransactionsResponse,
} from 'librechat-data-provider';
import type { ConversationListResponse, MessagesListResponse } from 'librechat-data-provider';

export const useGetAdminStats = (enabled = true) =>
  useQuery<TAdminStatsResponse>([QueryKeys.adminStats], () => dataService.getAdminStats(), {
    enabled,
  });

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

export const useGetAdminUserConversations = (
  userId: string | null,
  params?: { cursor?: string; limit?: number; sortBy?: string; sortDirection?: string; enabled?: boolean },
) => {
  const { cursor, limit = 25, sortBy = 'updatedAt', sortDirection = 'desc', enabled = true } = params ?? {};
  return useQuery<ConversationListResponse>(
    [QueryKeys.adminUserConversations, userId, cursor, limit, sortBy, sortDirection],
    () =>
      userId
        ? dataService.getAdminUserConversations(userId, { cursor, limit, sortBy, sortDirection })
        : Promise.resolve({ conversations: [], nextCursor: null }),
    { enabled: !!userId && enabled },
  );
};

export const useGetAdminUserConversationMessages = (
  userId: string | null,
  conversationId: string | null,
  params?: { limit?: number; enabled?: boolean },
) => {
  const { limit = 50, enabled = true } = params ?? {};
  return useQuery<MessagesListResponse>(
    [QueryKeys.adminUserConversationMessages, userId, conversationId, limit],
    () =>
      userId && conversationId
        ? dataService.getAdminUserConversationMessages(userId, conversationId, { limit })
        : Promise.resolve({ messages: [], nextCursor: null }),
    { enabled: !!userId && !!conversationId && enabled },
  );
};

export const useGetAdminUserTransactions = (
  userId: string | null,
  params?: { limit?: number; enabled?: boolean },
) => {
  const { limit = 50, enabled = true } = params ?? {};
  return useQuery<TBalanceTransactionsResponse>(
    [QueryKeys.adminUserTransactions, userId, limit],
    () =>
      userId
        ? dataService.getAdminUserTransactions(userId, { limit })
        : Promise.resolve({ transactions: [] }),
    { enabled: !!userId && enabled },
  );
};
