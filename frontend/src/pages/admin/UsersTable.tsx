import React from 'react';
import { Shield, LogIn, KeyRound } from 'lucide-react';
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
  <div className="bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] overflow-hidden">
    <div className="px-4 sm:px-6 py-4 border-b-2 border-slate-200 dark:border-neutral-700 flex items-center gap-3">
      <div className="w-10 h-10 bg-indigo-50 dark:bg-neutral-800 rounded-xl flex items-center justify-center border-2 border-indigo-100 dark:border-neutral-700">
        <Shield size={20} className="text-indigo-600 dark:text-indigo-400" />
      </div>
      <h2 className="text-xl font-bold text-slate-900 dark:text-white">Users</h2>
      {loading && (
        <span className="text-sm text-slate-500 dark:text-neutral-500 font-medium">Loading…</span>
      )}
    </div>

    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 dark:bg-neutral-800/70">
          <tr className="text-left">
            <th className="px-4 sm:px-6 py-3 font-bold text-slate-600 dark:text-neutral-300">User</th>
            <th className="px-4 sm:px-6 py-3 font-bold text-slate-600 dark:text-neutral-300">Role</th>
            <th className="px-4 sm:px-6 py-3 font-bold text-slate-600 dark:text-neutral-300">Active</th>
            <th className="px-4 sm:px-6 py-3 font-bold text-slate-600 dark:text-neutral-300">Must Reset</th>
            <th className="px-4 sm:px-6 py-3 font-bold text-slate-600 dark:text-neutral-300">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-t border-slate-100 dark:border-neutral-800">
              <td className="px-4 sm:px-6 py-4 min-w-[220px]">
                <div className="font-bold text-slate-900 dark:text-white truncate">{user.name}</div>
                <div className="text-slate-500 dark:text-neutral-400 truncate">{user.email}</div>
                {user.username && (
                  <div className="text-xs text-slate-400 dark:text-neutral-500">@{user.username}</div>
                )}
              </td>
              <td className="px-4 sm:px-6 py-4">
                <select
                  value={user.role}
                  onChange={(event) => onRoleChange(user, event.target.value)}
                  disabled={user.id === currentUserId}
                  className="px-3 py-2 bg-white dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl font-bold text-slate-900 dark:text-white"
                >
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </td>
              <td className="px-4 sm:px-6 py-4">
                <button
                  onClick={() => onToggleActive(user)}
                  disabled={user.id === currentUserId}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border-2 font-bold ${
                    user.isActive
                      ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-300'
                  }`}
                >
                  {user.isActive ? 'Active' : 'Inactive'}
                </button>
              </td>
              <td className="px-4 sm:px-6 py-4">
                <button
                  onClick={() => onToggleMustReset(user)}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border-2 font-bold ${
                    user.mustResetPassword
                      ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200'
                      : 'border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-300'
                  }`}
                >
                  {user.mustResetPassword ? 'Yes' : 'No'}
                </button>
              </td>
              <td className="px-4 sm:px-6 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => onImpersonate(user)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-900 dark:text-neutral-200 font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all"
                  >
                    <LogIn size={16} />
                    Impersonate
                  </button>
                  <button
                    onClick={() => void onResetPassword(user)}
                    disabled={user.id === currentUserId || resetPasswordLoadingId === user.id}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-900 dark:text-neutral-200 font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:hover:translate-y-0"
                    title={
                      user.id === currentUserId
                        ? 'Use Profile → Change Password for your own account'
                        : 'Generate a temporary password'
                    }
                  >
                    <KeyRound size={16} />
                    {resetPasswordLoadingId === user.id ? 'Generating…' : 'Reset Password'}
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
);
