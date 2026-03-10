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
import { getAllContentText } from '~/utils/messages';
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

const formatDate = (date: Date | string | undefined): string => {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
};

const getNextRefillDate = (
  lastRefill: string | Date | undefined,
  value: number | undefined,
  unit: string | undefined,
): Date | null => {
  if (!lastRefill || value == null || !unit) return null;
  const date = typeof lastRefill === 'string' ? new Date(lastRefill) : lastRefill;
  if (Number.isNaN(date.getTime())) return null;
  const next = new Date(date);
  switch (unit) {
    case 'seconds':
      next.setSeconds(next.getSeconds() + value);
      break;
    case 'minutes':
      next.setMinutes(next.getMinutes() + value);
      break;
    case 'hours':
      next.setHours(next.getHours() + value);
      break;
    case 'days':
      next.setDate(next.getDate() + value);
      break;
    case 'weeks':
      next.setDate(next.getDate() + value * 7);
      break;
    case 'months':
      next.setMonth(next.getMonth() + value);
      break;
    default:
      return null;
  }
  return next;
};

const getContextLabel = (context: string | undefined, localize: (key: string) => string): string => {
  if (!context) return '—';
  const key = CONTEXT_KEYS[context];
  return key ? localize(key) : context;
};

/** 1000 tokenCredits = $0.001 USD */
const TOKEN_CREDITS_PER_USD = 1_000_000;

const formatTrueCost = (tokenCredits: number): string => {
  const usd = tokenCredits / TOKEN_CREDITS_PER_USD;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(usd);
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
  const { data, isLoading, isError, refetch: refetchUsers } = useGetAdminUsers({
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

  const handleSearchSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }, [searchInput]);

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
            if (selectedUser?._id === user._id) setSelectedUser((u) => (u ? { ...u, tokenCredits: amount } : null));
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
            if (selectedUser?._id === vars.userId) setSelectedUser((u) => (u ? { ...u, tokenCredits: data.tokenCredits } : null));
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
  const transactionsQuery = useGetAdminUserTransactions(
    selectedUser?._id ?? null,
    { limit: 50, enabled: userDetailTab === 'credits' },
  );
  const conversations = convosQuery.data?.conversations ?? [];
  const messages = messagesQuery.data?.messages ?? [];
  const transactions = transactionsQuery.data?.transactions ?? [];

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
    <div className="flex min-w-0 flex-col gap-6 overflow-hidden text-sm text-text-primary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {stats && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label={localize('com_nav_admin_dashboard')}>
          <div className="rounded-lg border border-border-subtle bg-surface-primary-alt p-4">
            <div className="text-token-text-secondary text-xs">{localize('com_nav_admin_total_users')}</div>
            <div className="text-2xl font-semibold text-text-primary">{stats.totalUsers.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border border-border-subtle bg-surface-primary-alt p-4">
            <div className="text-token-text-secondary text-xs">{localize('com_nav_admin_recent_signups')}</div>
            <div className="text-2xl font-semibold text-text-primary">{stats.recentSignups.toLocaleString()}</div>
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
            className="flex-1 min-w-0"
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
        <div className="py-4 text-center text-token-text-secondary" role="status">
          {localize('com_ui_loading')}
        </div>
      )}

      {isError && (
        <div className="py-4 text-center text-red-600 dark:text-red-400" role="alert">
          {localize('com_ui_error')}
        </div>
      )}

      {!isLoading && !isError && users.length === 0 && (
        <div className="py-4 text-center text-token-text-secondary">
          {localize('com_nav_admin_no_users')}
        </div>
      )}

      {!isLoading && !isError && users.length > 0 && (
        <>
          <div className="min-w-0 overflow-hidden rounded-md border border-border-subtle">
            <table className="w-full table-fixed border-collapse text-left text-sm" role="table">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-secondary">
                  <th className="w-[12%] min-w-0 overflow-hidden p-1.5 font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort('email')}
                      className="flex min-w-0 items-center gap-1 truncate hover:underline"
                      aria-label={`${localize('com_nav_admin_sort_by' as TranslationKeys)} ${localize('com_nav_admin_user_email')}`}
                    >
                      <span className="truncate">{localize('com_nav_admin_user_email')}</span>
                      {sortBy === 'email' &&
                        (sortDirection === 'asc' ? (
                          <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                        ))}
                    </button>
                  </th>
                  <th className="w-[10%] min-w-0 overflow-hidden p-1.5 font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort('name')}
                      className="flex min-w-0 items-center gap-1 truncate hover:underline"
                      aria-label={`${localize('com_nav_admin_sort_by' as TranslationKeys)} ${localize('com_nav_admin_user_name')}`}
                    >
                      <span className="truncate">{localize('com_nav_admin_user_name')}</span>
                      {sortBy === 'name' &&
                        (sortDirection === 'asc' ? (
                          <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                        ))}
                    </button>
                  </th>
                  <th className="w-[6%] min-w-0 overflow-hidden p-1.5 font-medium">
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
                  <th className="w-[12%] min-w-0 overflow-hidden p-1.5 font-medium" title={localize('com_nav_admin_true_cost')}>
                    <button
                      type="button"
                      onClick={() => handleSort('tokenCredits')}
                      className="flex items-center gap-1 hover:underline"
                      aria-label={`${localize('com_nav_admin_sort_by' as TranslationKeys)} ${localize('com_nav_balance')}`}
                    >
                      {localize('com_nav_admin_balance_usd')}
                      {sortBy === 'tokenCredits' &&
                        (sortDirection === 'asc' ? (
                          <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                        ))}
                    </button>
                  </th>
                  <th className="w-[8%] min-w-0 overflow-hidden whitespace-nowrap p-1.5 font-medium" title={localize('com_nav_admin_real_cost')}>
                    {localize('com_nav_admin_spent_mo')}
                  </th>
                  <th className="w-[5%] min-w-0 overflow-hidden p-1.5 font-medium">
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
                  <th className="w-[8%] min-w-0 overflow-hidden p-1.5 font-medium">
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
                  <th className="w-[8%] min-w-0 overflow-hidden p-1.5 font-medium">{localize('com_nav_admin_last_refill')}</th>
                  <th className="w-[31%] min-w-0 overflow-hidden p-1.5 font-medium">{localize('com_nav_admin_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user._id}
                    className="border-b border-border-subtle last:border-b-0 hover:bg-surface-secondary/50"
                  >
                    <td className="min-w-0 overflow-hidden p-1.5" title={user.email ?? undefined}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUser(user);
                          setSelectedConversationId(null);
                          setUserDetailTab('conversations');
                          setIsUserDetailFullscreen(false);
                        }}
                        className="block w-full min-w-0 max-w-full truncate text-left font-medium text-token-text-primary hover:underline"
                        title={user.email ?? undefined}
                        aria-label={localize('com_nav_admin_view_user')}
                      >
                        {user.email ?? '—'}
                      </button>
                    </td>
                    <td className="min-w-0 overflow-hidden p-1.5" title={user.name ?? user.username ?? undefined}>
                      <span className="block w-full min-w-0 max-w-full truncate text-token-text-primary">
                        {user.name ?? user.username ?? '—'}
                      </span>
                    </td>
                    <td className="min-w-0 overflow-hidden p-1.5">
                      <span className="block w-full min-w-0 max-w-full truncate">{user.role ?? '—'}</span>
                    </td>
                    <td className="min-w-0 overflow-hidden p-1.5 font-medium text-token-text-primary" title={`${user.tokenCredits.toLocaleString()} ${formatTrueCost(user.tokenCredits)}`}>
                      <span className="inline-block min-w-0 max-w-full truncate">{user.tokenCredits.toLocaleString()}</span>
                      <span className="ml-0.5 shrink-0 text-token-text-secondary">({formatTrueCost(user.tokenCredits)})</span>
                    </td>
                    <td className="overflow-hidden whitespace-nowrap p-1.5 font-medium text-token-text-secondary" aria-label={formatTrueCost((user as TAdminUserItem & { totalSpentTokenCredits?: number }).totalSpentTokenCredits ?? 0)}>
                      {formatTrueCost((user as TAdminUserItem & { totalSpentTokenCredits?: number }).totalSpentTokenCredits ?? 0)}
                    </td>
                    <td className="overflow-hidden p-1.5">{user.conversationCount ?? 0}</td>
                    <td className="overflow-hidden whitespace-nowrap p-1.5 text-token-text-secondary" title={formatDate(user.createdAt)}>
                      <span className="block truncate">{formatDate(user.createdAt)}</span>
                    </td>
                    <td className="overflow-hidden whitespace-nowrap p-1.5 text-token-text-secondary" title={formatDate(user.lastRefill ?? undefined)}>
                      <span className="block truncate">{formatDate(user.lastRefill ?? undefined)}</span>
                    </td>
                    <td className="min-w-0 overflow-hidden p-1.5">
                      {user.isBanned && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
                          {localize('com_nav_admin_banned_badge')}
                        </span>
                      )}
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1 sm:gap-2">
                        <div className="flex min-w-0 shrink-0 items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            placeholder="Set"
                            value={balanceAmount[user._id] ?? ''}
                            onChange={(e) =>
                              setBalanceAmount((prev) => ({ ...prev, [user._id]: e.target.value }))
                            }
                            className="w-14 sm:w-20"
                            aria-label={localize('com_nav_admin_set_balance')}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleSetBalance(user)}
                            disabled={setBalanceMutation.isLoading}
                            className="shrink-0 text-xs sm:text-sm"
                          >
                            {localize('com_nav_admin_set_balance')}
                          </Button>
                        </div>
                        <div className="flex min-w-0 shrink-0 items-center gap-1">
                          <Input
                            type="number"
                            min={1}
                            placeholder="+"
                            value={addAmount[user._id] ?? ''}
                            onChange={(e) => setAddAmount((prev) => ({ ...prev, [user._id]: e.target.value }))}
                            className="w-14 sm:w-20"
                            aria-label={localize('com_nav_admin_add_credits')}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddBalance(user)}
                            disabled={addBalanceMutation.isLoading}
                            className="shrink-0 text-xs sm:text-sm"
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
            <div className="flex shrink-0 flex-col gap-4 border-b border-border-subtle bg-surface-secondary/30 px-4 py-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-semibold text-text-primary">
                    {selectedUser.name ?? selectedUser.username ?? selectedUser.email ?? '—'}
                  </h2>
                  <p className="mt-0.5 truncate text-sm text-token-text-secondary">
                    {selectedUser.email ?? '—'}
                  </p>
                  <p className="mt-2 text-sm text-text-primary">
                    {localize('com_nav_balance')}: {selectedUser.tokenCredits.toLocaleString()} · {localize('com_nav_admin_role')}: {selectedUser.role ?? '—'}
                  </p>
                  {selectedUser.lastRefill != null && (
                    <p className="mt-1 text-xs text-token-text-secondary">
                      {localize('com_nav_admin_last_refill')}: {formatDate(selectedUser.lastRefill)}
                    </p>
                  )}
                  {(() => {
                    const next = getNextRefillDate(
                      selectedUser.lastRefill ?? undefined,
                      selectedUser.refillIntervalValue,
                      selectedUser.refillIntervalUnit,
                    );
                    if (!next) return null;
                    return (
                      <p className="mt-0.5 text-xs text-token-text-secondary">
                        {localize('com_nav_admin_next_refill')}: {formatDate(next)}
                      </p>
                    );
                  })()}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setIsUserDetailFullscreen((prev) => !prev)}
                    className="rounded p-1.5 hover:bg-surface-secondary"
                    aria-label={isUserDetailFullscreen ? localize('com_ui_collapse') : localize('com_ui_expand')}
                  >
                    {isUserDetailFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseUserDetail}
                    className="rounded p-1.5 hover:bg-surface-secondary"
                    aria-label={localize('com_ui_close')}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={0}
                    placeholder={localize('com_nav_admin_set_balance')}
                    value={balanceAmount[selectedUser._id] ?? ''}
                    onChange={(e) =>
                      setBalanceAmount((prev) => ({ ...prev, [selectedUser._id]: e.target.value }))
                    }
                    className="w-24"
                    aria-label={localize('com_nav_admin_set_balance')}
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
                </div>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={1}
                    placeholder="+"
                    value={addAmount[selectedUser._id] ?? ''}
                    onChange={(e) => setAddAmount((prev) => ({ ...prev, [selectedUser._id]: e.target.value }))}
                    className="w-20"
                    aria-label={localize('com_nav_admin_add_credits')}
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
              </div>
            </div>
            <div className="flex border-b border-border-subtle">
              <button
                type="button"
                onClick={() => setUserDetailTab('conversations')}
                className={`px-4 py-2 text-sm font-medium ${userDetailTab === 'conversations' ? 'border-b-2 border-token-text-primary text-text-primary' : 'text-token-text-secondary'}`}
              >
                {localize('com_nav_admin_tab_conversations')}
              </button>
              <button
                type="button"
                onClick={() => setUserDetailTab('credits')}
                className={`px-4 py-2 text-sm font-medium ${userDetailTab === 'credits' ? 'border-b-2 border-token-text-primary text-text-primary' : 'text-token-text-secondary'}`}
              >
                {localize('com_nav_admin_tab_credits')}
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {userDetailTab === 'conversations' && (
                <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-auto md:grid-cols-2">
                  <div className="flex flex-col overflow-auto border-r border-border-subtle">
                    {convosQuery.isLoading && (
                      <div className="p-4 text-token-text-secondary">{localize('com_ui_loading')}</div>
                    )}
                    {!convosQuery.isLoading && conversations.length === 0 && (
                      <div className="p-4 text-token-text-secondary">
                        {localize('com_nav_admin_no_conversations')}
                      </div>
                    )}
                    {!convosQuery.isLoading &&
                      conversations.map((convo) => (
                        <button
                          key={convo.conversationId}
                          type="button"
                          onClick={() => setSelectedConversationId(convo.conversationId)}
                          className={`border-b border-border-subtle px-4 py-2 text-left last:border-b-0 hover:bg-surface-secondary ${
                            selectedConversationId === convo.conversationId ? 'bg-surface-secondary' : ''
                          }`}
                        >
                          <div className="truncate font-medium text-text-primary">
                            {convo.title || convo.conversationId || '—'}
                          </div>
                          <div className="text-xs text-token-text-secondary">{formatDate(convo.updatedAt)}</div>
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
                      <div className="p-4 text-token-text-secondary">
                        {localize('com_nav_admin_select_conversation')}
                      </div>
                    )}
                    {selectedConversationId && messagesQuery.isLoading && (
                      <div className="p-4 text-token-text-secondary">{localize('com_ui_loading')}</div>
                    )}
                    {selectedConversationId && !messagesQuery.isLoading && messages.length === 0 && (
                      <div className="p-4 text-token-text-secondary">
                        {localize('com_nav_admin_no_messages')}
                      </div>
                    )}
                    {selectedConversationId &&
                      !messagesQuery.isLoading &&
                      messages.map((msg: TMessage) => (
                        <div
                          key={msg.messageId}
                          className="border-b border-border-subtle px-4 py-2 last:border-b-0"
                        >
                          <div className="flex items-center gap-2 text-xs text-token-text-secondary">
                            <span>
                              {msg.isCreatedByUser ? localize('com_ui_you') : msg.sender ?? 'Assistant'}
                            </span>
                            <span>{formatDate(msg.createdAt)}</span>
                            {msg.model && <span>{msg.model}</span>}
                          </div>
                          <div className="mt-1 break-words text-text-primary">
                            {getAllContentText(msg) || '—'}
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
                        const amount = tx.rawAmount ?? tx.tokenValue ?? 0;
                        const isCredit = amount > 0;
                        return (
                          <div
                            key={tx._id}
                            className="flex items-center justify-between border-b border-border-subtle py-2 text-sm last:border-b-0"
                          >
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium text-text-primary">
                                {getContextLabel(tx.context, (key) => localize(key as Parameters<typeof localize>[0]))}
                              </span>
                              <span className="text-token-text-secondary text-xs">
                                {formatDate(tx.createdAt)}
                                {tx.model ? ` · ${tx.model}` : ''}
                              </span>
                            </div>
                            <span
                              className={`shrink-0 font-medium ${isCredit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
                            >
                              {isCredit ? '+' : ''}
                              {Math.abs(amount).toLocaleString()}
                            </span>
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
