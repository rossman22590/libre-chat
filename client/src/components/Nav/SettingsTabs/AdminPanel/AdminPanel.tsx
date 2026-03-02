import React, { useState, useCallback, useEffect } from 'react';
import { Button, Input, useToastContext } from '@librechat/client';
import { X, RefreshCw } from 'lucide-react';
import {
  useGetAdminUsers,
  useGetAdminStats,
  useSetAdminUserBalanceMutation,
  useAddAdminUserBalanceMutation,
  useBanAdminUserMutation,
  useUnbanAdminUserMutation,
  useGetAdminUserConversations,
  useGetAdminUserConversationMessages,
  useGetAdminUserTransactions,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
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

const getApiErrorMessage = (error: unknown): string => {
  if (error && typeof error === 'object' && 'response' in error) {
    const res = (error as { response?: { data?: { error?: string } } }).response;
    if (typeof res?.data?.error === 'string') return res.data.error;
  }
  return '';
};

const getContextLabel = (context: string | undefined, localize: (key: string) => string): string => {
  if (!context) return '—';
  const key = CONTEXT_KEYS[context];
  return key ? localize(key) : context;
};

type UserDetailTab = 'conversations' | 'credits';

const AdminPanel: React.FC = () => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [balanceAmount, setBalanceAmount] = useState<Record<string, string>>({});
  const [addAmount, setAddAmount] = useState<Record<string, string>>({});
  const [banMinutes, setBanMinutes] = useState<Record<string, string>>({});
  const [selectedUser, setSelectedUser] = useState<TAdminUserItem | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [userDetailTab, setUserDetailTab] = useState<UserDetailTab>('conversations');
  const [pendingBan, setPendingBan] = useState<{ user: TAdminUserItem; minutes: number } | null>(null);

  const { data: stats, refetch: refetchStats } = useGetAdminStats();
  const { data, isLoading, isError, refetch: refetchUsers } = useGetAdminUsers({
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    enabled: true,
  });

  const setBalanceMutation = useSetAdminUserBalanceMutation();
  const addBalanceMutation = useAddAdminUserBalanceMutation();
  const banMutation = useBanAdminUserMutation();
  const unbanMutation = useUnbanAdminUserMutation();

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

  const handleBanClick = useCallback((user: TAdminUserItem) => {
    const raw = banMinutes[user._id] ?? '';
    const minutes = parseInt(raw, 10);
    if (isNaN(minutes) || minutes <= 0) {
      showToast({ status: 'error', message: localize('com_ui_error') });
      return;
    }
    setPendingBan({ user, minutes });
  }, [banMinutes, showToast, localize]);

  const handleConfirmBan = useCallback(() => {
    if (!pendingBan) return;
    banMutation.mutate(
      { userId: pendingBan.user._id, durationMinutes: pendingBan.minutes },
      {
        onSuccess: () => {
          showToast({ status: 'success', message: localize('com_ui_saved') });
          setBanMinutes((prev) => ({ ...prev, [pendingBan.user._id]: '' }));
          setPendingBan(null);
        },
        onError: (error: unknown) => {
          const msg = getApiErrorMessage(error) || localize('com_ui_error');
          showToast({ status: 'error', message: msg });
          setPendingBan(null);
        },
      },
    );
  }, [pendingBan, banMutation, showToast, localize]);

  const handleUnban = useCallback(
    (user: TAdminUserItem) => {
      unbanMutation.mutate(user._id, {
        onSuccess: () => showToast({ status: 'success', message: localize('com_ui_saved') }),
        onError: () => showToast({ status: 'error', message: localize('com_ui_error') }),
      });
    },
    [unbanMutation, showToast, localize],
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

  return (
    <div className="flex flex-col gap-6 text-sm text-text-primary">
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

      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <Input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={localize('com_ui_search')}
          className="flex-1"
          aria-label={localize('com_ui_search')}
        />
        <Button type="submit" variant="default" size="sm">
          {localize('com_ui_search')}
        </Button>
      </form>

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
          <div className="overflow-x-auto rounded-md border border-border-subtle">
            <table className="w-full text-left text-sm" role="table">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-secondary">
                  <th className="p-2 font-medium">{localize('com_nav_admin_user_email')}</th>
                  <th className="p-2 font-medium">{localize('com_nav_admin_user_name')}</th>
                  <th className="p-2 font-medium">{localize('com_nav_admin_role')}</th>
                  <th className="p-2 font-medium">{localize('com_nav_balance')}</th>
                  <th className="p-2 font-medium">{localize('com_nav_admin_conversations_count')}</th>
                  <th className="p-2 font-medium">{localize('com_nav_admin_created')}</th>
                  <th className="p-2 font-medium">{localize('com_nav_admin_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user._id}
                    className="border-b border-border-subtle last:border-b-0 hover:bg-surface-secondary/50"
                  >
                    <td className="p-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUser(user);
                          setSelectedConversationId(null);
                          setUserDetailTab('conversations');
                        }}
                        className="text-left font-medium text-token-text-primary hover:underline"
                        aria-label={localize('com_nav_admin_view_user')}
                      >
                        {user.email ?? '—'}
                      </button>
                    </td>
                    <td className="p-2">{user.name ?? user.username ?? '—'}</td>
                    <td className="p-2">{user.role ?? '—'}</td>
                    <td className="p-2 font-medium">{user.tokenCredits.toLocaleString()}</td>
                    <td className="p-2">{user.conversationCount ?? 0}</td>
                    <td className="p-2 text-token-text-secondary">{formatDate(user.createdAt)}</td>
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
                            onChange={(e) => setAddAmount((prev) => ({ ...prev, [user._id]: e.target.value }))}
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
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={1}
                            placeholder="60"
                            value={banMinutes[user._id] ?? ''}
                            onChange={(e) =>
                              setBanMinutes((prev) => ({ ...prev, [user._id]: e.target.value }))
                            }
                            className="w-16"
                            aria-label={localize('com_nav_admin_ban_minutes')}
                          />
                          <span className="text-token-text-secondary text-xs">m</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleBanClick(user)}
                            disabled={banMutation.isLoading}
                          >
                            {localize('com_nav_admin_ban')}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleUnban(user)}
                            disabled={unbanMutation.isLoading}
                          >
                            {localize('com_nav_admin_unban')}
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

      {pendingBan && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
          role="dialog"
          aria-label="Confirm ban"
          onClick={() => setPendingBan(null)}
        >
          <div
            className="rounded-lg border border-border-subtle bg-background p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-4 text-text-primary">
              {localize('com_nav_admin_confirm_ban').replace('{{minutes}}', String(pendingBan.minutes))}
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPendingBan(null)}>
                {localize('com_ui_cancel')}
              </Button>
              <Button type="button" variant="destructive" size="sm" onClick={handleConfirmBan}>
                {localize('com_nav_admin_ban')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {selectedUser && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/30"
          role="dialog"
          aria-label={localize('com_nav_admin_user_detail')}
          onClick={(e) => e.target === e.currentTarget && handleCloseUserDetail()}
        >
          <div
            className="flex w-full max-w-3xl flex-col bg-background shadow-xl sm:w-[32rem]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 flex-col gap-2 border-b border-border-subtle px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-text-primary">
                    {selectedUser.name ?? selectedUser.username ?? selectedUser.email ?? '—'}
                  </h3>
                  <p className="text-xs text-token-text-secondary">{selectedUser.email}</p>
                  <p className="mt-1 text-xs text-token-text-secondary">
                    {localize('com_nav_balance')}: {selectedUser.tokenCredits.toLocaleString()} · {localize('com_nav_admin_role')}: {selectedUser.role ?? '—'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseUserDetail}
                  className="rounded p-1 hover:bg-surface-secondary"
                  aria-label={localize('com_ui_close')}
                >
                  <X className="h-5 w-5" />
                </button>
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
                  onChange={(e) => setAddAmount((prev) => ({ ...prev, [selectedUser._id]: e.target.value }))}
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
                <Input
                  type="number"
                  min={1}
                  placeholder="min"
                  value={banMinutes[selectedUser._id] ?? ''}
                  onChange={(e) =>
                    setBanMinutes((prev) => ({ ...prev, [selectedUser._id]: e.target.value }))
                  }
                  className="w-16"
                  aria-label={localize('com_nav_admin_ban_minutes')}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleBanClick(selectedUser)}
                  disabled={banMutation.isLoading}
                >
                  {localize('com_nav_admin_ban')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleUnban(selectedUser)}
                  disabled={unbanMutation.isLoading}
                >
                  {localize('com_nav_admin_unban')}
                </Button>
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
                            {typeof msg.text === 'string'
                              ? msg.text
                              : Array.isArray(msg.text)
                                ? msg.text
                                    .filter((t) => t?.type === 'text')
                                    .map((t) => (t as { text?: string })?.text)
                                    .join(' ')
                                : '—'}
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
