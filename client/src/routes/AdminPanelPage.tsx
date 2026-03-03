import React from 'react';
import { Navigate } from 'react-router-dom';
import { SystemRoles } from 'librechat-data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import AdminPanel from '~/components/Nav/SettingsTabs/AdminPanel/AdminPanel';

export default function AdminPanelPage() {
  const { user } = useAuthContext();
  const localize = useLocalize();

  if (user?.role !== SystemRoles.ADMIN) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background">
      <div className="flex shrink-0 flex-col gap-4 border-b border-border-subtle bg-surface-primary-alt px-4 py-4 sm:px-6">
        <h1 className="text-lg font-semibold text-text-primary">
          {localize('com_nav_admin_panel')}
        </h1>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <AdminPanel />
      </div>
    </div>
  );
}
