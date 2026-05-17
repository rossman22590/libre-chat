import React, { useState, useCallback, useEffect } from 'react';
import { Button, Input, useToastContext } from '@librechat/client';
import { X, Maximize2, Minimize2, RefreshCw, ChevronUp, ChevronDown } from 'lucide-react';
import {
  useGetAdminUsers,
  useGetAdminStats,
  useSetAdminUserBalanceMutation,
  useSetAllAdminUsersBalanceMutation,
  useAddAdminUserBalanceMutation,
  useGetAdminUserConversations,
  useGetAdminUserConversationMessages,
  useGetAdminUserTransactions,
} from '~/data-provider';
import { useLocalize, type TranslationKeys } from '~/hooks';
import type { TAdminUserItem, TBalanceTransactionItem } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';

const PAGE_SIZE = 20;

const CONTEXT_KEYS: Record<string, string> = {
  message: 'com_nav_balance_transaction_context_message',
  title: 'com_nav_balance_transaction_context_title',
  autoRefill: 'com_nav_balance_transaction_context_autoRefill',
  admin: 'com_nav_balance_transaction_context_admin',
  reasoning: 'com_nav_balance_transaction_context_reasoning',
  incomplete: 'com_nav_balance_transaction_context_incomplete',
};

const TOKEN_TYPE_KEYS: Record<TBalanceTransactionItem['tokenType'], TranslationKeys> = {
  prompt: 'com_nav_admin_token_input' as TranslationKeys,
  completion: 'com_nav_admin_token_output' as TranslationKeys,
  credits: 'com_nav_admin_token_credits' as TranslationKeys,
};

const formatDate = (date: Date | string | undefined): string => {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
};

const getContextLabel = (
  context: string | undefined,
  localize: (key: string) => string,
): string => {
  if (!context) return '—';
  const key = CONTEXT_KEYS[context];
  return key ? localize(key) : context;
};

const getTokenTypeLabel = (
  tokenType: TBalanceTransactionItem['tokenType'],
  localize: (key: TranslationKeys) => string,
): string => localize(TOKEN_TYPE_KEYS[tokenType]);

const getTransactionCreditAmount = (tx: TBalanceTransactionItem): number =>
  tx.tokenValue ?? tx.rawAmount ?? 0;

const formatCredits = (value = 0): string =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);

const formatUsd = (value = 0): string =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value > 0 && value < 0.01 ? 6 : 2,
    maximumFractionDigits: 6,
  }).format(value);

type MessageTextPart = { type?: string; text?: string };

type AdminMessage = Omit<TMessage, 'text'> & {
  text?: string | MessageTextPart[];
  summary?: string;
  content?: MessageTextPart[];
};

const getTextParts = (parts: MessageTextPart[] | undefined): string => {
  if (!Array.isArray(parts)) {
    return '';
  }

  return parts
    .filter((part) => part?.type === 'text' || part?.type == null)
    .map((part) => part?.text)
    .filter(Boolean)
    .join(' ');
};

const getMessageText = (message: AdminMessage): string => {
  if (typeof message.text === 'string' && message.text.trim() !== '') {
    return message.text;
  }

  const textParts = getTextParts(Array.isArray(message.text) ? message.text : undefined);
  if (textParts.trim() !== '') {
    return textParts;
  }

  const contentText = getTextParts(message.content);
  if (contentText.trim() !== '') {
    return contentText;
  }

  if (typeof message.summary === 'string' && message.summary.trim() !== '') {
    return message.summary;
  }

  return '—';
};

type UserDetailTab = 'conversations' | 'credits';

type AdminUsersSortField =
  | 'email'
  | 'name'
  | 'role'
  | 'tokenCredits'
  | 'conversationCount'
  | 'createdAt';

const AdminPanel: React.FC = () => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState<AdminUsersSortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [balanceAmount, setBalanceAmount] = useState<Record<string, string>>({});
  const [addAmount, setAddAmount] = useState<Record<string, string>>({});
  const [selectedUser, setSelectedUser] = useState<TAdminUserItem | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [userDetailTab, setUserDetailTab] = useState<UserDetailTab>('conversations');
  const [isUserDetailFullscreen, setIsUserDetailFullscreen] = useState(false);
  const [grantAllAmount, setGrantAllAmount] = useState('');

  const { data: stats, refetch: refetchStats } = useGetAdminStats();
  const {
    data,
    isLoading,
    isError,
    refetch: refetchUsers,
  } = useGetAdminUsers({
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    sortBy,
    sortDirection,
    enabled: true,
  });

  const handleSort = useCallback((field: AdminUsersSortField) => {
    setPage(1);
    setSortBy((prev) => {
      if (prev === field) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDirection(
        field === 'tokenCredits' || field === 'conversationCount' || field === 'createdAt'
          ? 'desc'
          : 'asc',
      );
      return field;
    });
  }, []);

  const setBalanceMutation = useSetAdminUserBalanceMutation();
  const setAllBalanceMutation = useSetAllAdminUsersBalanceMutation();
  const addBalanceMutation = useAddAdminUserBalanceMutation();

  const handleSearchSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setSearch(searchInput.trim());
      setPage(1);
    },
    [searchInput],
  );

  const handleSetBalance = useCallback(
    (user: TAdminUserItem) => {
      const raw = balanceAmount[user._id] ?? '';
      const amount = parseInt(raw, 10);
      if (isNaN(amount) || amount < 0) {
        showToast({ status: 'error', message: localize('com_ui_error') });
        return;
      }
      setBalanceMutation.mutate(
        { userId: user._id, amount },
        {
          onSuccess: () => {
            showToast({ status: 'success', message: localize('com_ui_saved') });
            setBalanceAmount((prev) => ({ ...prev, [user._id]: '' }));
            if (selectedUser?._id === user._id)
              setSelectedUser((u) => (u ? { ...u, tokenCredits: amount } : null));
          },
          onError: () => showToast({ status: 'error', message: localize('com_ui_error') }),
        },
      );
    },
    [balanceAmount, setBalanceMutation, showToast, localize, selectedUser?._id],
  );

  const handleAddBalance = useCallback(
    (user: TAdminUserItem) => {
      const raw = addAmount[user._id] ?? '';
      const amount = parseInt(raw, 10);
      if (isNaN(amount) || amount <= 0) {
        showToast({ status: 'error', message: localize('com_ui_error') });
        return;
      }
      addBalanceMutation.mutate(
        { userId: user._id, amount },
        {
          onSuccess: (res, vars) => {
            const data = res as { tokenCredits: number };
            showToast({ status: 'success', message: localize('com_ui_saved') });
            setAddAmount((prev) => ({ ...prev, [vars.userId]: '' }));
            if (selectedUser?._id === vars.userId)
              setSelectedUser((u) => (u ? { ...u, tokenCredits: data.tokenCredits } : null));
          },
          onError: () => showToast({ status: 'error', message: localize('com_ui_error') }),
        },
      );
    },
    [addAmount, addBalanceMutation, showToast, localize, selectedUser?._id],
  );

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const convosQuery = useGetAdminUserConversations(selectedUser?._id ?? null, { limit: 50 });
  const messagesQuery = useGetAdminUserConversationMessages(
    selectedUser?._id ?? null,
    selectedConversationId,
    { limit: 100 },
  );
  const transactionsQuery = useGetAdminUserTransactions(selectedUser?._id ?? null, { limit: 50 });
  const conversations = convosQuery.data?.conversations ?? [];
  const messages = messagesQuery.data?.messages ?? [];
  const transactions = transactionsQuery.data?.transactions ?? [];
  const usageSummary = transactionsQuery.data?.summary;
  const usdPerCredit = usageSummary?.usdPerCredit ?? 0.000001;

  const handleCloseUserDetail = useCallback(() => {
    setSelectedUser(null);
    setSelectedConversationId(null);
    setUserDetailTab('conversations');
    setIsUserDetailFullscreen(false);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedUser) handleCloseUserDetail();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedUser, handleCloseUserDetail]);

  const handleRefresh = useCallback(() => {
    refetchStats();
    refetchUsers();
  }, [refetchStats, refetchUsers]);

  const handleGrantAllBalance = useCallback(() => {
    const amount = parseInt(grantAllAmount, 10);
    if (isNaN(amount) || amount < 0) {
      showToast({ status: 'error', message: localize('com_ui_error') });
      return;
    }
    setAllBalanceMutation.mutate(amount, {
      onSuccess: (res) => {
        const data = res as { updatedCount: number; amount: number };
        showToast({
          status: 'success',
          message: localize('com_nav_admin_grant_all_success', {
            count: data.updatedCount.toLocaleString(),
            amount: data.amount.toLocaleString(),
          } as Record<string, unknown>),
        });
        setGrantAllAmount('');
        refetchUsers();
        refetchStats();
      },
      onError: () => showToast({ status: 'error', message: localize('com_ui_error') }),
    });
  }, [grantAllAmount, setAllBalanceMutation, showToast, localize, refetchUsers, refetchStats]);

  return (
    <div className="flex flex-col gap-6 text-sm text-text-primary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {stats && (
          <div
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            aria-label={localize('com_nav_admin_dashboard')}
          >
            <div className="border-border-subtle rounded-lg border bg-surface-primary-alt p-4">
              <div className="text-token-text-secondary text-xs">
                {localize('com_nav_admin_total_users')}
              </div>
              <div className="text-2xl font-semibold text-text-primary">
                {stats.totalUsers.toLocaleString()}
              </div>
            </div>
            <div className="border-border-subtle rounded-lg border bg-surface-primary-alt p-4">
              <div className="text-token-text-secondary text-xs">
                {localize('com_nav_admin_recent_signups')}
              </div>
              <div className="text-2xl font-semibold text-text-primary">
                {stats.recentSignups.toLocaleString()}
              </div>
            </div>
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          aria-label={localize('com_ui_refresh')}
        >
          <RefreshCw className="icon-sm mr-1" aria-hidden="true" />
          {localize('com_ui_refresh')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-1 gap-2">
          <Input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={localize('com_ui_search')}
            className="min-w-0 flex-1"
            aria-label={localize('com_ui_search')}
          />
          <Button type="submit" variant="default" size="sm">
            {localize('com_ui_search')}
          </Button>
        </form>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            value={grantAllAmount}
            onChange={(e) => setGrantAllAmount(e.target.value)}
            placeholder={localize('com_nav_admin_grant_all_placeholder')}
            className="w-28"
            aria-label={localize('com_nav_admin_grant_all_balance')}
          />
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleGrantAllBalance}
            disabled={setAllBalanceMutation.isLoading}
            aria-label={localize('com_nav_admin_grant_all_balance')}
          >
            {localize('com_nav_admin_grant_all_balance')}
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="text-token-text-secondary py-4 text-center" role="status">
          {localize('com_ui_loading')}
        </div>
      )}

      {isError && (
        <div className="py-4 text-center text-red-600 dark:text-red-400" role="alert">
          {localize('com_ui_error')}
        </div>
      )}

      {!isLoading && !isError && users.length === 0 && (
        <div className="text-token-text-secondary py-4 text-center">
          {localize('com_nav_admin_no_users')}
        </div>
      )}

      {!isLoading && !isError && users.length > 0 && (
        <>
          <div className="border-border-subtle overflow-x-auto rounded-md border">
            <table className="w-full text-left text-sm" role="table">
              <thead>
                <tr className="border-border-subtle border-b bg-surface-secondary">
                  <th className="p-2 font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort('email')}
                      className="flex items-center gap-1 hover:underline"
                      aria-label={`${localize('com_nav_admin_sort_by' as TranslationKeys)} ${localize('com_nav_admin_user_email')}`}
                    >
                      {localize('com_nav_admin_user_email')}
                      {sortBy === 'email' &&
                        (sortDirection === 'asc' ? (
                          <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                        ))}
                    </button>
                  </th>
                  <th className="p-2 font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort('name')}
                      className="flex items-center gap-1 hover:underline"
                      aria-label={`${localize('com_nav_admin_sort_by' as TranslationKeys)} ${localize('com_nav_admin_user_name')}`}
                    >
                      {localize('com_nav_admin_user_name')}
                      {sortBy === 'name' &&
                        (sortDirection === 'asc' ? (
                          <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                        ))}
                    </button>
                  </th>
                  <th className="p-2 font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort('role')}
                      className="flex items-center gap-1 hover:underline"
                      aria-label={`${localize('com_nav_admin_sort_by' as TranslationKeys)} ${localize('com_nav_admin_role')}`}
                    >
                      {localize('com_nav_admin_role')}
                      {sortBy === 'role' &&
                        (sortDirection === 'asc' ? (
                          <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                        ))}
                    </button>
                  </th>
                  <th className="p-2 font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort('tokenCredits')}
                      className="flex items-center gap-1 hover:underline"
                      aria-label={`${localize('com_nav_admin_sort_by' as TranslationKeys)} ${localize('com_nav_balance')}`}
                    >
                      {localize('com_nav_balance')}
                      {sortBy === 'tokenCredits' &&
                        (sortDirection === 'asc' ? (
                          <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                        ))}
                    </button>
                  </th>
                  <th className="p-2 font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort('conversationCount')}
                      className="flex items-center gap-1 hover:underline"
                      aria-label={`${localize('com_nav_admin_sort_by' as TranslationKeys)} ${localize('com_nav_admin_conversations_count')}`}
                    >
                      {localize('com_nav_admin_conversations_count')}
                      {sortBy === 'conversationCount' &&
                        (sortDirection === 'asc' ? (
                          <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                        ))}
                    </button>
                  </th>
                  <th className="p-2 font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort('createdAt')}
                      className="flex items-center gap-1 hover:underline"
                      aria-label={`${localize('com_nav_admin_sort_by' as TranslationKeys)} ${localize('com_nav_admin_created')}`}
                    >
                      {localize('com_nav_admin_created')}
                      {sortBy === 'createdAt' &&
                        (sortDirection === 'asc' ? (
                          <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                        ))}
                    </button>
                  </th>
                  <th className="p-2 font-medium">{localize('com_nav_admin_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user._id}
                    className="border-border-subtle hover:bg-surface-secondary/50 border-b last:border-b-0"
                  >
                    <td className="p-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUser(user);
                          setSelectedConversationId(null);
                          setUserDetailTab('conversations');
                          setIsUserDetailFullscreen(false);
                        }}
                        className="text-token-text-primary text-left font-medium hover:underline"
                        aria-label={localize('com_nav_admin_view_user')}
                      >
                        {user.email ?? '—'}
                      </button>
                    </td>
                    <td className="p-2">{user.name ?? user.username ?? '—'}</td>
                    <td className="p-2">{user.role ?? '—'}</td>
                    <td className="p-2 font-medium">{user.tokenCredits.toLocaleString()}</td>
                    <td className="p-2">{user.conversationCount ?? 0}</td>
                    <td className="text-token-text-secondary p-2">{formatDate(user.createdAt)}</td>
                    <td className="p-2">
                      {user.isBanned && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
                          {localize('com_nav_admin_banned_badge')}
                        </span>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            placeholder="Set"
                            value={balanceAmount[user._id] ?? ''}
                            onChange={(e) =>
                              setBalanceAmount((prev) => ({ ...prev, [user._id]: e.target.value }))
                            }
                            className="w-20"
                            aria-label={localize('com_nav_admin_set_balance')}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleSetBalance(user)}
                            disabled={setBalanceMutation.isLoading}
                          >
                            {localize('com_nav_admin_set_balance')}
                          </Button>
                        </div>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={1}
                            placeholder="+"
                            value={addAmount[user._id] ?? ''}
                            onChange={(e) =>
                              setAddAmount((prev) => ({ ...prev, [user._id]: e.target.value }))
                            }
                            className="w-20"
                            aria-label={localize('com_nav_admin_add_credits')}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddBalance(user)}
                            disabled={addBalanceMutation.isLoading}
                          >
                            {localize('com_nav_admin_add_credits')}
                          </Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-token-text-secondary">
                {localize('com_nav_admin_page')} {page} / {totalPages} ({total}{' '}
                {localize('com_nav_admin_users')})
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  {localize('com_ui_prev')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  {localize('com_ui_next')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {selectedUser && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/30"
          role="dialog"
          aria-label={localize('com_nav_admin_user_detail')}
          onClick={(e) => e.target === e.currentTarget && handleCloseUserDetail()}
        >
          <div
            className={`flex w-full flex-col bg-background shadow-xl ${isUserDetailFullscreen ? '' : 'max-w-3xl sm:w-[32rem]'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-border-subtle flex shrink-0 flex-col gap-2 border-b px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-text-primary">
                    {selectedUser.name ?? selectedUser.username ?? selectedUser.email ?? '—'}
                  </h3>
                  <p className="text-token-text-secondary text-xs">{selectedUser.email}</p>
                  <p className="text-token-text-secondary mt-1 text-xs">
                    {localize('com_nav_balance')}: {selectedUser.tokenCredits.toLocaleString()} ·{' '}
                    {localize('com_nav_admin_role')}: {selectedUser.role ?? '—'}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setIsUserDetailFullscreen((prev) => !prev)}
                    className="rounded p-1 hover:bg-surface-secondary"
                    aria-label={
                      isUserDetailFullscreen
                        ? localize('com_ui_collapse')
                        : localize('com_ui_expand')
                    }
                  >
                    {isUserDetailFullscreen ? (
                      <Minimize2 className="h-5 w-5" />
                    ) : (
                      <Maximize2 className="h-5 w-5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseUserDetail}
                    className="rounded p-1 hover:bg-surface-secondary"
                    aria-label={localize('com_ui_close')}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input
                  type="number"
                  min={0}
                  placeholder={localize('com_nav_admin_set_balance')}
                  value={balanceAmount[selectedUser._id] ?? ''}
                  onChange={(e) =>
                    setBalanceAmount((prev) => ({ ...prev, [selectedUser._id]: e.target.value }))
                  }
                  className="w-24"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSetBalance(selectedUser)}
                  disabled={setBalanceMutation.isLoading}
                >
                  {localize('com_nav_admin_set_balance')}
                </Button>
                <Input
                  type="number"
                  min={1}
                  placeholder="+"
                  value={addAmount[selectedUser._id] ?? ''}
                  onChange={(e) =>
                    setAddAmount((prev) => ({ ...prev, [selectedUser._id]: e.target.value }))
                  }
                  className="w-20"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddBalance(selectedUser)}
                  disabled={addBalanceMutation.isLoading}
                >
                  {localize('com_nav_admin_add_credits')}
                </Button>
              </div>
              {transactionsQuery.isLoading && (
                <div className="border-border-subtle text-token-text-secondary rounded-md border bg-surface-primary-alt p-3 text-xs">
                  {localize('com_ui_loading')}
                </div>
              )}
              {usageSummary && (
                <div className="border-border-subtle grid grid-cols-2 gap-2 rounded-md border bg-surface-primary-alt p-3 sm:grid-cols-3">
                  <div className="col-span-2 text-xs font-medium text-text-primary sm:col-span-3">
                    {localize('com_nav_admin_usage_summary')}
                    <span className="text-token-text-secondary ml-2 font-normal">
                      {localize('com_nav_admin_usage_period', {
                        days: String(usageSummary.periodDays ?? 40),
                      } as Record<string, unknown>)}
                    </span>
                  </div>
                  <div>
                    <div className="text-token-text-secondary text-xs">
                      {localize('com_nav_admin_usage_credits')}
                    </div>
                    <div className="font-semibold text-text-primary">
                      {formatCredits(usageSummary.usageCredits)}
                    </div>
                  </div>
                  <div>
                    <div className="text-token-text-secondary text-xs">
                      {localize('com_nav_admin_usage_cost')}
                    </div>
                    <div className="font-semibold text-text-primary">
                      {formatUsd(usageSummary.usageUsd)}
                    </div>
                  </div>
                  <div>
                    <div className="text-token-text-secondary text-xs">
                      {localize('com_nav_admin_usage_input')}
                    </div>
                    <div className="font-semibold text-text-primary">
                      {formatUsd(usageSummary.inputUsd)}
                    </div>
                    <div className="text-token-text-secondary text-xs">
                      {localize('com_nav_admin_usage_credits_and_tokens', {
                        credits: formatCredits(usageSummary.inputCredits),
                        tokens: formatCredits(usageSummary.inputTokens),
                      } as Record<string, unknown>)}
                    </div>
                  </div>
                  <div>
                    <div className="text-token-text-secondary text-xs">
                      {localize('com_nav_admin_usage_output')}
                    </div>
                    <div className="font-semibold text-text-primary">
                      {formatUsd(usageSummary.outputUsd)}
                    </div>
                    <div className="text-token-text-secondary text-xs">
                      {localize('com_nav_admin_usage_credits_and_tokens', {
                        credits: formatCredits(usageSummary.outputCredits),
                        tokens: formatCredits(usageSummary.outputTokens),
                      } as Record<string, unknown>)}
                    </div>
                  </div>
                  <div>
                    <div className="text-token-text-secondary text-xs">
                      {localize('com_nav_admin_usage_added')}
                    </div>
                    <div className="font-semibold text-text-primary">
                      {formatCredits(usageSummary.addedCredits)}
                    </div>
                  </div>
                  <div>
                    <div className="text-token-text-secondary text-xs">
                      {localize('com_nav_admin_usage_net')}
                    </div>
                    <div className="font-semibold text-text-primary">
                      {formatCredits(usageSummary.netCredits)}
                    </div>
                  </div>
                  {(usageSummary.modelBreakdown?.length ?? 0) > 0 && (
                    <div className="col-span-2 sm:col-span-3">
                      <div className="text-token-text-secondary text-xs">
                        {localize('com_nav_admin_usage_by_model')}
                      </div>
                      <div className="mt-2 flex flex-col gap-2">
                        {usageSummary.modelBreakdown?.map((modelUsage) => (
                          <div
                            key={modelUsage.model ?? 'unknown'}
                            className="border-border-subtle rounded border bg-surface-primary px-2 py-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate font-medium text-text-primary">
                                {modelUsage.model ?? localize('com_nav_admin_unknown_model')}
                              </span>
                              <span className="shrink-0 font-semibold text-text-primary">
                                {formatUsd(modelUsage.usageUsd)}
                              </span>
                            </div>
                            <div className="text-token-text-secondary mt-1 text-xs">
                              {localize('com_nav_admin_usage_model_io', {
                                input: formatUsd(modelUsage.inputUsd),
                                output: formatUsd(modelUsage.outputUsd),
                              } as Record<string, unknown>)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="border-border-subtle flex border-b">
              <button
                type="button"
                onClick={() => setUserDetailTab('conversations')}
                className={`px-4 py-2 text-sm font-medium ${userDetailTab === 'conversations' ? 'border-token-text-primary border-b-2 text-text-primary' : 'text-token-text-secondary'}`}
              >
                {localize('com_nav_admin_tab_conversations')}
              </button>
              <button
                type="button"
                onClick={() => setUserDetailTab('credits')}
                className={`px-4 py-2 text-sm font-medium ${userDetailTab === 'credits' ? 'border-token-text-primary border-b-2 text-text-primary' : 'text-token-text-secondary'}`}
              >
                {localize('com_nav_admin_tab_credits')}
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {userDetailTab === 'conversations' && (
                <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-auto md:grid-cols-2">
                  <div className="border-border-subtle flex flex-col overflow-auto border-r">
                    {convosQuery.isLoading && (
                      <div className="text-token-text-secondary p-4">
                        {localize('com_ui_loading')}
                      </div>
                    )}
                    {!convosQuery.isLoading && conversations.length === 0 && (
                      <div className="text-token-text-secondary p-4">
                        {localize('com_nav_admin_no_conversations')}
                      </div>
                    )}
                    {!convosQuery.isLoading &&
                      conversations.map((convo) => (
                        <button
                          key={convo.conversationId}
                          type="button"
                          onClick={() => setSelectedConversationId(convo.conversationId)}
                          className={`border-border-subtle border-b px-4 py-2 text-left last:border-b-0 hover:bg-surface-secondary ${
                            selectedConversationId === convo.conversationId
                              ? 'bg-surface-secondary'
                              : ''
                          }`}
                        >
                          <div className="truncate font-medium text-text-primary">
                            {convo.title || convo.conversationId || '—'}
                          </div>
                          <div className="text-token-text-secondary text-xs">
                            {formatDate(convo.updatedAt)}
                          </div>
                        </button>
                      ))}
                  </div>
                  <div className="flex flex-col overflow-auto">
                    <div className="shrink-0 px-4 py-2">
                      <h4 className="text-sm font-medium text-text-primary">
                        {localize('com_nav_admin_messages')}
                        {selectedConversationId ? ` (${messages.length})` : ''}
                      </h4>
                    </div>
                    {!selectedConversationId && (
                      <div className="text-token-text-secondary p-4">
                        {localize('com_nav_admin_select_conversation')}
                      </div>
                    )}
                    {selectedConversationId && messagesQuery.isLoading && (
                      <div className="text-token-text-secondary p-4">
                        {localize('com_ui_loading')}
                      </div>
                    )}
                    {selectedConversationId &&
                      !messagesQuery.isLoading &&
                      messages.length === 0 && (
                        <div className="text-token-text-secondary p-4">
                          {localize('com_nav_admin_no_messages')}
                        </div>
                      )}
                    {selectedConversationId &&
                      !messagesQuery.isLoading &&
                      messages.map((msg: TMessage) => (
                        <div
                          key={msg.messageId}
                          className="border-border-subtle border-b px-4 py-2 last:border-b-0"
                        >
                          <div className="text-token-text-secondary flex items-center gap-2 text-xs">
                            <span>
                              {msg.isCreatedByUser
                                ? localize('com_ui_you')
                                : (msg.sender ?? 'Assistant')}
                            </span>
                            <span>{formatDate(msg.createdAt)}</span>
                            {msg.model && <span>{msg.model}</span>}
                          </div>
                          <div className="mt-1 break-words text-text-primary">
                            {getMessageText(msg as AdminMessage)}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
              {userDetailTab === 'credits' && (
                <div className="flex flex-col overflow-auto p-4">
                  <h4 className="mb-2 text-sm font-medium text-text-primary">
                    {localize('com_nav_admin_credit_history')}
                  </h4>
                  {transactionsQuery.isLoading && (
                    <div className="text-token-text-secondary">{localize('com_ui_loading')}</div>
                  )}
                  {!transactionsQuery.isLoading && transactions.length === 0 && (
                    <div className="text-token-text-secondary">
                      {localize('com_nav_balance_transaction_no_transactions')}
                    </div>
                  )}
                  {!transactionsQuery.isLoading && transactions.length > 0 && (
                    <div className="flex flex-col gap-1">
                      {transactions.map((tx: TBalanceTransactionItem) => {
                        const amount = getTransactionCreditAmount(tx);
                        const isCredit = amount > 0;
                        return (
                          <div
                            key={tx._id}
                            className="border-border-subtle flex items-center justify-between border-b py-2 text-sm last:border-b-0"
                          >
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium text-text-primary">
                                {getContextLabel(tx.context, (key) =>
                                  localize(key as Parameters<typeof localize>[0]),
                                )}
                              </span>
                              <span className="text-token-text-secondary text-xs">
                                {getTokenTypeLabel(tx.tokenType, localize)}
                                {' - '}
                                {formatDate(tx.createdAt)}
                                {tx.model ? ` - ${tx.model}` : ''}
                              </span>
                            </div>
                            <div className="shrink-0 text-right">
                              <div
                                className={`font-medium ${isCredit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                              >
                                {isCredit ? '+' : ''}
                                {formatCredits(Math.abs(amount))}
                              </div>
                              <div className="text-token-text-secondary text-xs">
                                {formatUsd(Math.abs(amount) * usdPerCredit)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
