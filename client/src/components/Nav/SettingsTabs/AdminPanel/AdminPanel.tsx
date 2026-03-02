import React, { useState, useCallback } from 'react';
import { ShieldEllipsis } from 'lucide-react';
import { Button, Input, useToastContext } from '@librechat/client';
import {
  useGetAdminUsers,
  useSetAdminUserBalanceMutation,
  useBanAdminUserMutation,
  useUnbanAdminUserMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';
import type { TAdminUserItem } from 'librechat-data-provider';

const PAGE_SIZE = 20;

const AdminPanel: React.FC = () => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [balanceAmount, setBalanceAmount] = useState<Record<string, string>>({});
  const [banMinutes, setBanMinutes] = useState<Record<string, string>>({});

  const { data, isLoading, isError } = useGetAdminUsers({
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    enabled: true,
  });

  const setBalanceMutation = useSetAdminUserBalanceMutation();
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
          },
          onError: () => {
            showToast({ status: 'error', message: localize('com_ui_error') });
          },
        },
      );
    },
    [balanceAmount, setBalanceMutation, showToast, localize],
  );

  const handleBan = useCallback(
    (user: TAdminUserItem) => {
      const raw = banMinutes[user._id] ?? '';
      const durationMinutes = parseInt(raw, 10);
      if (isNaN(durationMinutes) || durationMinutes <= 0) {
        showToast({ status: 'error', message: localize('com_ui_error') });
        return;
      }
      banMutation.mutate(
        { userId: user._id, durationMinutes },
        {
          onSuccess: () => {
            showToast({ status: 'success', message: localize('com_ui_saved') });
            setBanMinutes((prev) => ({ ...prev, [user._id]: '' }));
          },
          onError: () => {
            showToast({ status: 'error', message: localize('com_ui_error') });
          },
        },
      );
    },
    [banMinutes, banMutation, showToast, localize],
  );

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

  return (
    <div className="flex flex-col gap-4 p-4 text-sm text-text-primary">
      <div className="flex items-center gap-2">
        <ShieldEllipsis className="h-5 w-5 shrink-0" aria-hidden="true" />
        <h2 className="text-base font-medium">{localize('com_nav_admin_panel')}</h2>
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
                  <th className="p-2 font-medium">{localize('com_nav_balance')}</th>
                  <th className="p-2 font-medium">{localize('com_nav_admin_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user._id}
                    className="border-b border-border-subtle last:border-b-0"
                  >
                    <td className="p-2">{user.email ?? '—'}</td>
                    <td className="p-2">{user.name ?? user.username ?? '—'}</td>
                    <td className="p-2 font-medium">{user.tokenCredits.toLocaleString()}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            placeholder="0"
                            value={balanceAmount[user._id] ?? ''}
                            onChange={(e) =>
                              setBalanceAmount((prev) => ({ ...prev, [user._id]: e.target.value }))
                            }
                            className="w-24"
                            aria-label={localize('com_nav_admin_set_balance')}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleSetBalance(user)}
                            disabled={setBalanceMutation.isPending}
                          >
                            {localize('com_nav_admin_set_balance')}
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
                            className="w-20"
                            aria-label={localize('com_nav_admin_ban_minutes')}
                          />
                          <span className="text-token-text-secondary">min</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleBan(user)}
                            disabled={banMutation.isPending}
                          >
                            {localize('com_nav_admin_ban')}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleUnban(user)}
                            disabled={unbanMutation.isPending}
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
    </div>
  );
};

export default AdminPanel;
