import React, { useState } from 'react';
import { Ban, Trash2 } from 'lucide-react';
import {
  Button,
  Spinner,
  Dropdown,
  OGDialog,
  OGDialogTemplate,
  useToastContext,
} from '@librechat/client';
import type { TAdminUserItem } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import {
  useBanAdminUserMutation,
  useUnbanAdminUserMutation,
  useDeleteAdminUserMutation,
} from '~/data-provider';
import { useLocalize } from '~/hooks';

type AdminApiError = { response?: { data?: { error?: string } } };

type ModerationProps = {
  user: TAdminUserItem;
  onBanChange: (isBanned: boolean) => void;
  onDeleted: () => void;
};

const MINUTES_PER_DAY = 24 * 60;

const BAN_DURATIONS: { minutes: number; labelKey: TranslationKeys }[] = [
  { minutes: 60, labelKey: 'com_nav_admin_ban_1h' },
  { minutes: MINUTES_PER_DAY, labelKey: 'com_nav_admin_ban_1d' },
  { minutes: 7 * MINUTES_PER_DAY, labelKey: 'com_nav_admin_ban_7d' },
  { minutes: 30 * MINUTES_PER_DAY, labelKey: 'com_nav_admin_ban_30d' },
  { minutes: 100 * 365 * MINUTES_PER_DAY, labelKey: 'com_nav_admin_ban_permanent' },
];

const getApiError = (error: unknown, fallback: string): string =>
  (error as AdminApiError | undefined)?.response?.data?.error ?? fallback;

const Moderation: React.FC<ModerationProps> = ({ user, onBanChange, onDeleted }) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [banMinutes, setBanMinutes] = useState(String(BAN_DURATIONS[1].minutes));
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const banMutation = useBanAdminUserMutation();
  const unbanMutation = useUnbanAdminUserMutation();
  const deleteMutation = useDeleteAdminUserMutation();
  const displayName = user.name ?? user.username ?? user.email ?? '—';

  const showError = (error: unknown) =>
    showToast({ status: 'error', message: getApiError(error, localize('com_ui_error')) });

  const handleBan = () =>
    banMutation.mutate(
      { userId: user._id, durationMinutes: parseInt(banMinutes, 10) },
      {
        onSuccess: () => {
          showToast({
            status: 'success',
            message: localize('com_nav_admin_ban_success', { 0: displayName }),
          });
          onBanChange(true);
        },
        onError: showError,
      },
    );

  const handleUnban = () =>
    unbanMutation.mutate(user._id, {
      onSuccess: () => {
        showToast({
          status: 'success',
          message: localize('com_nav_admin_unban_success', { 0: displayName }),
        });
        onBanChange(false);
      },
      onError: showError,
    });

  const handleDelete = () =>
    deleteMutation.mutate(user._id, {
      onSuccess: () => {
        showToast({
          status: 'success',
          message: localize('com_nav_admin_delete_user_success', { 0: displayName }),
        });
        setIsDeleteOpen(false);
        onDeleted();
      },
      onError: showError,
    });

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label={localize('com_nav_admin_moderation')}
    >
      {user.isBanned ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleUnban}
          disabled={unbanMutation.isLoading}
        >
          {localize('com_nav_admin_unban')}
        </Button>
      ) : (
        <>
          <Dropdown
            value={banMinutes}
            onChange={setBanMinutes}
            options={BAN_DURATIONS.map(({ minutes, labelKey }) => ({
              value: String(minutes),
              label: localize(labelKey),
            }))}
            ariaLabel={localize('com_nav_admin_ban_duration')}
            sizeClasses="z-[60] w-36"
            testId="admin-ban-duration"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleBan}
            disabled={banMutation.isLoading}
          >
            <Ban className="icon-sm mr-1" aria-hidden="true" />
            {localize('com_nav_admin_ban')}
          </Button>
        </>
      )}
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={() => setIsDeleteOpen(true)}
        disabled={deleteMutation.isLoading}
      >
        <Trash2 className="icon-sm mr-1" aria-hidden="true" />
        {localize('com_nav_admin_delete_user')}
      </Button>
      <OGDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <OGDialogTemplate
          showCloseButton={false}
          title={localize('com_nav_admin_delete_user')}
          className="max-w-[450px]"
          main={
            <p className="text-left text-sm text-text-primary">
              {localize('com_nav_admin_delete_user_confirm', { 0: displayName })}
            </p>
          }
          selection={{
            selectHandler: handleDelete,
            selectClasses:
              'bg-surface-destructive text-white transition-all duration-200 hover:bg-surface-destructive-hover',
            selectText: deleteMutation.isLoading ? <Spinner /> : localize('com_ui_delete'),
          }}
        />
      </OGDialog>
    </div>
  );
};

export default Moderation;
