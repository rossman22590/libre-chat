import React from 'react';
import { Navigate } from 'react-router-dom';
import { SystemRoles } from 'librechat-data-provider';
import AdminPanel from '~/components/Nav/SettingsTabs/AdminPanel/AdminPanel';
import { useAuthContext, useLocalize } from '~/hooks';

export default function AdminPanelPage() {
  const { user } = useAuthContext();
  const localize = useLocalize();

  if (user?.role !== SystemRoles.ADMIN) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex h-full w-full flex-col overflow-auto bg-surface-primary">
      <div className="border-border-subtle flex shrink-0 flex-col gap-4 border-b bg-surface-primary-alt px-4 py-4 sm:px-6">
        <h1 className="text-lg font-semibold text-text-primary">
          {localize('com_nav_admin_panel')}
        </h1>
      </div>
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <AdminPanel />
      </div>
    </div>
  );
}
