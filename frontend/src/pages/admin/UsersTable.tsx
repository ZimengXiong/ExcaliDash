import React from 'react';
import { Shield, ShieldCheck, LogIn, KeyRound, User } from 'lucide-react';
import { PlayfulSelect } from '../../components/PlayfulSelect';
import { SettingsSectionHeader } from '../settings/SettingsRow';
import type { AdminUser } from './types';

type UsersTableProps = {
  users: AdminUser[];
  loading: boolean;
  currentUserId?: string;
  resetPasswordLoadingId: string | null;
  onRoleChange: (user: AdminUser, role: string) => void;
  onToggleActive: (user: AdminUser) => void;
  onToggleMustReset: (user: AdminUser) => void;
  onImpersonate: (user: AdminUser) => void;
  onResetPassword: (user: AdminUser) => void | Promise<void>;
};

export const UsersTable: React.FC<UsersTableProps> = ({
  users,
  loading,
  currentUserId,
  resetPasswordLoadingId,
  onRoleChange,
  onToggleActive,
  onToggleMustReset,
  onImpersonate,
  onResetPassword,
}) => (
  <section>
    <SettingsSectionHeader
      icon={<Shield size={20} />}
      tileClassName="border-indigo-200 bg-indigo-50 text-indigo-600 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-300"
      title="Users"
    >
      {loading ? (
        <span className="text-xs font-bold text-slate-400 dark:text-neutral-500">Loading…</span>
      ) : null}
    </SettingsSectionHeader>

    <div className="overflow-hidden rounded-2xl border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]">
      <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 dark:bg-neutral-800/70">
          <tr className="text-left">
            <th className="px-4 sm:px-6 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-neutral-400">User</th>
            <th className="px-4 sm:px-6 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Role</th>
            <th className="px-4 sm:px-6 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Active</th>
            <th className="px-4 sm:px-6 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Reset?</th>
            <th className="px-4 sm:px-6 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-neutral-400">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-t border-slate-100 dark:border-neutral-800">
              <td className="px-4 sm:px-6 py-3 min-w-[220px]">
                <div className="font-bold text-slate-900 dark:text-white truncate">{user.name}</div>
                <div className="text-slate-500 dark:text-neutral-400 truncate">{user.email}</div>
                {user.username && (
                  <div className="text-xs text-slate-400 dark:text-neutral-500">@{user.username}</div>
                )}
              </td>
              <td className="px-4 sm:px-6 py-3">
                <PlayfulSelect
                  ariaLabel={`Role for ${user.name}`}
                  value={user.role}
                  disabled={user.id === currentUserId}
                  onChange={(role) => onRoleChange(user, role)}
                  size="sm"
                  options={[
                    { value: 'USER', label: 'USER', icon: <User size={13} /> },
                    { value: 'ADMIN', label: 'ADMIN', icon: <ShieldCheck size={13} /> },
                  ]}
                />
              </td>
              <td className="px-4 sm:px-6 py-3">
                <button
                  onClick={() => onToggleActive(user)}
                  disabled={user.id === currentUserId}
                  className={`inline-flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg border-2 font-bold ${
                    user.isActive
                      ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-300'
                  }`}
                >
                  {user.isActive ? 'Active' : 'Inactive'}
                </button>
              </td>
              <td className="px-4 sm:px-6 py-3">
                <button
                  onClick={() => onToggleMustReset(user)}
                  className={`inline-flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg border-2 font-bold ${
                    user.mustResetPassword
                      ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200'
                      : 'border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-300'
                  }`}
                >
                  {user.mustResetPassword ? 'Yes' : 'No'}
                </button>
              </td>
              <td className="px-4 sm:px-6 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => onImpersonate(user)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border-2 border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-900 dark:text-neutral-200 font-bold hover:border-black dark:hover:border-neutral-400 transition-colors"
                  >
                    <LogIn size={14} />
                    Impersonate
                  </button>
                  <button
                    onClick={() => void onResetPassword(user)}
                    disabled={user.id === currentUserId || resetPasswordLoadingId === user.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border-2 border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-900 dark:text-neutral-200 font-bold hover:border-black dark:hover:border-neutral-400 transition-colors disabled:opacity-60"
                    title={
                      user.id === currentUserId
                        ? 'Use Profile → Change Password for your own account'
                        : 'Generate a temporary password'
                    }
                  >
                    <KeyRound size={14} />
                    {resetPasswordLoadingId === user.id ? 'Generating…' : 'Reset'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {users.length === 0 && !loading && (
            <tr>
              <td colSpan={5} className="px-6 py-6 text-slate-500 dark:text-neutral-500 font-medium">
                No users found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  </section>
);
