import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { ConfirmModal } from '../components/ConfirmModal';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import type { Collection } from '../types';
import { Shield, UserPlus, RefreshCw, UserCog, LogIn, Settings as SettingsIcon, KeyRound } from 'lucide-react';
import {
  IMPERSONATION_KEY,
  type ImpersonationState,
  readImpersonationState,
  USER_KEY,
} from '../utils/impersonation';
import {
  getPasswordMinLength,
  getPasswordRequirementsLabel,
  validatePasswordForCurrentEnv,
} from '../utils/passwordPolicy';

type AdminUser = {
  id: string;
  username: string | null;
  email: string;
  name: string;
  role: 'ADMIN' | 'USER' | string;
  mustResetPassword: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export const Admin: React.FC = () => {
  const navigate = useNavigate();
  const { user: authUser, authEnabled } = useAuth();
  const isAdmin = authUser?.role === 'ADMIN';

  const [collections, setCollections] = useState<Collection[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createName, setCreateName] = useState('');
  const [createUsername, setCreateUsername] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState<'ADMIN' | 'USER'>('USER');
  const [createMustReset, setCreateMustReset] = useState(true);
  const [createActive, setCreateActive] = useState(true);

  const [impersonateTarget, setImpersonateTarget] = useState<AdminUser | null>(null);
  const [resetPasswordLoadingId, setResetPasswordLoadingId] = useState<string | null>(null);
  const [resetPasswordResult, setResetPasswordResult] = useState<{ email: string; tempPassword: string } | null>(null);

  const [loginRateLimitLoading, setLoginRateLimitLoading] = useState(false);
  const [loginRateLimitSaving, setLoginRateLimitSaving] = useState(false);
  const [loginRateLimitEnabled, setLoginRateLimitEnabled] = useState(true);
  const [loginRateLimitWindowMinutes, setLoginRateLimitWindowMinutes] = useState(15);
  const [loginRateLimitMax, setLoginRateLimitMax] = useState(20);
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    if (authEnabled === false) {
      navigate('/settings', { replace: true });
      return;
    }
    if (authEnabled && !isAdmin) {
      navigate('/', { replace: true });
      return;
    }
  }, [authEnabled, isAdmin, navigate]);

  const loadCollections = async () => {
    try {
      const data = await api.getCollections();
      setCollections(data);
    } catch (err) {
      console.error('Failed to fetch collections:', err);
    }
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    setError('');
    try {
      const response = await api.api.get<{ users: AdminUser[] }>('/auth/users');
      setUsers(response.data.users || []);
    } catch (err: unknown) {
      let message = 'Failed to load users';
      if (api.isAxiosError(err)) {
        message = err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    } finally {
      setLoadingUsers(false);
    }
  };

  const generateTempPassword = async (target: AdminUser) => {
    setResetPasswordLoadingId(target.id);
    setError('');
    setSuccess('');
    try {
      const response = await api.api.post<{ tempPassword: string; user: { id: string; email: string } }>(
        `/auth/users/${target.id}/reset-password`
      );
      setResetPasswordResult({ email: response.data.user?.email || target.email, tempPassword: response.data.tempPassword });
      setSuccess(`Temporary password generated for ${target.email}`);
      await loadUsers();
    } catch (err: unknown) {
      let message = 'Failed to reset password';
      if (api.isAxiosError(err)) {
        message = err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    } finally {
      setResetPasswordLoadingId(null);
    }
  };

  const loadLoginRateLimitConfig = async () => {
    setLoginRateLimitLoading(true);
    setError('');
    try {
      const response = await api.api.get<{
        config: { enabled: boolean; windowMs: number; max: number };
      }>('/auth/rate-limit/login');
      const cfg = response.data.config;
      setLoginRateLimitEnabled(Boolean(cfg.enabled));
      setLoginRateLimitMax(Number(cfg.max));
      setLoginRateLimitWindowMinutes(Math.max(1, Math.round(Number(cfg.windowMs) / 60000)));
    } catch (err: unknown) {
      let message = 'Failed to load rate limit config';
      if (api.isAxiosError(err)) {
        message = err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    } finally {
      setLoginRateLimitLoading(false);
    }
  };

  const saveLoginRateLimitConfig = async () => {
    setLoginRateLimitSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        enabled: loginRateLimitEnabled,
        windowMs: Math.max(10_000, Math.round(loginRateLimitWindowMinutes * 60_000)),
        max: Math.max(1, Math.round(loginRateLimitMax)),
      };
      const response = await api.api.put<{
        config: { enabled: boolean; windowMs: number; max: number };
      }>('/auth/rate-limit/login', payload);

      const cfg = response.data.config;
      setLoginRateLimitEnabled(Boolean(cfg.enabled));
      setLoginRateLimitMax(Number(cfg.max));
      setLoginRateLimitWindowMinutes(Math.max(1, Math.round(Number(cfg.windowMs) / 60000)));
      setSuccess('Login rate limit updated');
    } catch (err: unknown) {
      let message = 'Failed to save rate limit config';
      if (api.isAxiosError(err)) {
        message = err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    } finally {
      setLoginRateLimitSaving(false);
    }
  };

  const resetLoginRateLimit = async () => {
    const identifier = resetIdentifier.trim();
    if (!identifier) {
      setError('Enter an email/username to reset');
      return;
    }
    setResetLoading(true);
    setError('');
    setSuccess('');
    try {
      await api.api.post('/auth/rate-limit/login/reset', { identifier });
      setSuccess(`Reset login rate limit for ${identifier}`);
      setResetIdentifier('');
    } catch (err: unknown) {
      let message = 'Failed to reset rate limit';
      if (api.isAxiosError(err)) {
        message = err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    } finally {
      setResetLoading(false);
    }
  };

  useEffect(() => {
    if (!authEnabled || !isAdmin) return;
    void loadCollections();
    void loadUsers();
    void loadLoginRateLimitConfig();
  }, [authEnabled, isAdmin]);

  const handleSelectCollection = (id: string | null | undefined) => {
    if (id === undefined) navigate('/');
    else if (id === null) navigate('/collections?id=unorganized');
    else navigate(`/collections?id=${id}`);
  };

  const handleCreateCollection = async (name: string) => {
    await api.createCollection(name);
    const newCollections = await api.getCollections();
    setCollections(newCollections);
  };

  const handleEditCollection = async (id: string, name: string) => {
    setCollections(prev => prev.map(c => (c.id === id ? { ...c, name } : c)));
    await api.updateCollection(id, name);
  };

  const handleDeleteCollection = async (id: string) => {
    setCollections(prev => prev.filter(c => c.id !== id));
    await api.deleteCollection(id);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const passwordError = validatePasswordForCurrentEnv(createPassword, 'Temporary password');
    if (passwordError) {
      setError(passwordError);
      return;
    }

    try {
      const payload = {
        email: createEmail.trim().toLowerCase(),
        name: createName.trim(),
        username: createUsername.trim() ? createUsername.trim() : undefined,
        password: createPassword,
        role: createRole,
        mustResetPassword: createMustReset,
        isActive: createActive,
      };

      const response = await api.api.post<{ user: AdminUser }>('/auth/users', payload);
      setUsers(prev => [...prev, response.data.user].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      setSuccess('User created');
      setCreateEmail('');
      setCreateName('');
      setCreateUsername('');
      setCreatePassword('');
      setCreateRole('USER');
      setCreateMustReset(true);
      setCreateActive(true);
      setCreateOpen(false);
    } catch (err: unknown) {
      let message = 'Failed to create user';
      if (api.isAxiosError(err)) {
        message = err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    }
  };

  const patchUser = async (id: string, data: Partial<Pick<AdminUser, 'username' | 'name' | 'role' | 'mustResetPassword' | 'isActive'>>) => {
    setError('');
    setSuccess('');
    try {
      const response = await api.api.patch<{ user: AdminUser }>(`/auth/users/${id}`, data);
      setUsers(prev => prev.map(u => (u.id === id ? response.data.user : u)));
      setSuccess('User updated');
    } catch (err: unknown) {
      let message = 'Failed to update user';
      if (api.isAxiosError(err)) {
        message = err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    }
  };

  const startImpersonation = async (target: AdminUser) => {
    setError('');
    setSuccess('');

    if (readImpersonationState()) {
      setError('Stop the current impersonation before starting a new one.');
      return;
    }

    const originalUser = localStorage.getItem(USER_KEY);
    if (!originalUser) {
      setError('Missing current session user state.');
      return;
    }

    try {
      const response = await api.api.post<{
        user: { id: string; email: string; name: string };
        accessToken: string;
        refreshToken: string;
      }>('/auth/impersonate', { userId: target.id });

      const state: ImpersonationState = {
        original: {
          user: JSON.parse(originalUser),
        },
        impersonator: {
          id: authUser?.id || 'unknown',
          email: authUser?.email || 'unknown',
          name: authUser?.name || 'Unknown Admin',
        },
        target: {
          id: response.data.user.id,
          email: response.data.user.email,
          name: response.data.user.name,
        },
        startedAt: new Date().toISOString(),
      };

      localStorage.setItem(IMPERSONATION_KEY, JSON.stringify(state));
      localStorage.setItem(USER_KEY, JSON.stringify(response.data.user));

      window.location.href = '/';
    } catch (err: unknown) {
      let message = 'Failed to impersonate user';
      if (api.isAxiosError(err)) {
        message = err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    }
  };

  if (authEnabled === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <Layout
      collections={collections}
      selectedCollectionId="ADMIN"
      onSelectCollection={handleSelectCollection}
      onCreateCollection={handleCreateCollection}
      onEditCollection={handleEditCollection}
      onDeleteCollection={handleDeleteCollection}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6 sm:mb-8 min-w-0">
        <div className="min-w-0">
          <h1 className="text-3xl sm:text-5xl text-slate-900 dark:text-white pl-1" style={{ fontFamily: 'Excalifont' }}>
            Admin
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-neutral-400 font-medium">
            User management and impersonation
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => loadUsers()}
            disabled={loadingUsers}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-900 dark:text-neutral-200 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all disabled:opacity-60"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          <button
            onClick={() => setCreateOpen(v => !v)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl border-2 border-black dark:border-neutral-700 bg-indigo-600 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 transition-all"
          >
            <UserPlus size={16} />
            New User
          </button>
        </div>
      </div>

      {success && (
        <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
          <p className="text-green-800 dark:text-green-200 font-medium">{success}</p>
        </div>
      )}
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl">
          <p className="text-red-800 dark:text-red-200 font-medium">{error}</p>
        </div>
      )}

      {createOpen && (
        <div className="mb-6 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-indigo-50 dark:bg-neutral-800 rounded-xl flex items-center justify-center border-2 border-indigo-100 dark:border-neutral-700">
              <UserCog size={24} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Create User</h2>
          </div>

          <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">Email</label>
              <input
                type="email"
                value={createEmail}
                onChange={e => setCreateEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">Name</label>
              <input
                type="text"
                value={createName}
                onChange={e => setCreateName(e.target.value)}
                required
                className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">Username (optional)</label>
              <input
                type="text"
                value={createUsername}
                onChange={e => setCreateUsername(e.target.value)}
                className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">Temporary Password</label>
              <input
                type="password"
                value={createPassword}
                onChange={e => setCreatePassword(e.target.value)}
                minLength={getPasswordMinLength()}
                required
                placeholder={`Temporary password (${getPasswordRequirementsLabel()})`}
                className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">Role</label>
              <select
                value={createRole}
                onChange={e => setCreateRole(e.target.value as 'ADMIN' | 'USER')}
                className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white outline-none"
              >
                <option value="USER">USER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </div>

            <div className="flex items-center gap-3 pt-8">
              <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={createMustReset}
                  onChange={e => setCreateMustReset(e.target.checked)}
                />
                Must reset password
              </label>
              <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-neutral-300">
                <input
                  type="checkbox"
                  checked={createActive}
                  onChange={e => setCreateActive(e.target.checked)}
                />
                Active
              </label>
            </div>

            <div className="md:col-span-2 flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="px-4 py-2 text-sm font-bold rounded-xl border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-900 dark:text-neutral-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-bold rounded-xl border-2 border-black dark:border-neutral-700 bg-indigo-600 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 transition-all"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="mb-6 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-slate-50 dark:bg-neutral-800 rounded-xl flex items-center justify-center border-2 border-slate-200 dark:border-neutral-700">
            <SettingsIcon size={24} className="text-slate-700 dark:text-neutral-200" />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Login Rate Limiting</h2>
            <p className="text-sm text-slate-600 dark:text-neutral-400 font-medium">
              Reduce brute-force attacks; disable only for trusted environments.
            </p>
          </div>
          {loginRateLimitLoading && (
            <span className="ml-auto text-sm text-slate-500 dark:text-neutral-500 font-medium">Loading…</span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="flex items-center gap-3 pt-1">
            <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-neutral-300">
              <input
                type="checkbox"
                checked={loginRateLimitEnabled}
                onChange={e => setLoginRateLimitEnabled(e.target.checked)}
              />
              Enabled
            </label>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">Window (minutes)</label>
            <input
              type="number"
              min={1}
              value={loginRateLimitWindowMinutes}
              onChange={e => setLoginRateLimitWindowMinutes(Number(e.target.value))}
              className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">Max attempts</label>
            <input
              type="number"
              min={1}
              value={loginRateLimitMax}
              onChange={e => setLoginRateLimitMax(Number(e.target.value))}
              className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white outline-none"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
              Reset lockout (email/username)
            </label>
            <input
              list="admin-user-identifiers"
              value={resetIdentifier}
              onChange={e => setResetIdentifier(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white outline-none"
            />
            <datalist id="admin-user-identifiers">
              {users.map(u => (
                <option key={u.id} value={u.email} />
              ))}
            </datalist>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={() => void resetLoginRateLimit()}
              disabled={resetLoading}
              className="px-4 py-2 text-sm font-bold rounded-xl border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-900 dark:text-neutral-200 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all disabled:opacity-60"
            >
              {resetLoading ? 'Resetting…' : 'Reset'}
            </button>
            <button
              onClick={() => void saveLoginRateLimitConfig()}
              disabled={loginRateLimitSaving}
              className="px-4 py-2 text-sm font-bold rounded-xl border-2 border-black dark:border-neutral-700 bg-indigo-600 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 transition-all disabled:opacity-60"
            >
              {loginRateLimitSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b-2 border-slate-200 dark:border-neutral-700 flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 dark:bg-neutral-800 rounded-xl flex items-center justify-center border-2 border-indigo-100 dark:border-neutral-700">
            <Shield size={20} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Users</h2>
          {loadingUsers && <span className="text-sm text-slate-500 dark:text-neutral-500 font-medium">Loading…</span>}
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
              {users.map(u => (
                <tr key={u.id} className="border-t border-slate-100 dark:border-neutral-800">
                  <td className="px-4 sm:px-6 py-4 min-w-[220px]">
                    <div className="font-bold text-slate-900 dark:text-white truncate">{u.name}</div>
                    <div className="text-slate-500 dark:text-neutral-400 truncate">{u.email}</div>
                    {u.username && <div className="text-xs text-slate-400 dark:text-neutral-500">@{u.username}</div>}
                  </td>
                  <td className="px-4 sm:px-6 py-4">
                    <select
                      value={u.role}
                      onChange={e => patchUser(u.id, { role: e.target.value })}
                      disabled={u.id === authUser?.id}
                      className="px-3 py-2 bg-white dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl font-bold text-slate-900 dark:text-white"
                    >
                      <option value="USER">USER</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </td>
                  <td className="px-4 sm:px-6 py-4">
                    <button
                      onClick={() => patchUser(u.id, { isActive: !u.isActive })}
                      disabled={u.id === authUser?.id}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border-2 font-bold ${
                        u.isActive
                          ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                          : 'border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-300'
                      }`}
                    >
                      {u.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 sm:px-6 py-4">
                    <button
                      onClick={() => patchUser(u.id, { mustResetPassword: !u.mustResetPassword })}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border-2 font-bold ${
                        u.mustResetPassword
                          ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200'
                          : 'border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-300'
                      }`}
                    >
                      {u.mustResetPassword ? 'Yes' : 'No'}
                    </button>
                  </td>
                  <td className="px-4 sm:px-6 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setImpersonateTarget(u)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-900 dark:text-neutral-200 font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all"
                      >
                        <LogIn size={16} />
                        Impersonate
                      </button>
                      <button
                        onClick={() => void generateTempPassword(u)}
                        disabled={u.id === authUser?.id || resetPasswordLoadingId === u.id}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-900 dark:text-neutral-200 font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:hover:translate-y-0"
                        title={u.id === authUser?.id ? 'Use Profile → Change Password for your own account' : 'Generate a temporary password'}
                      >
                        <KeyRound size={16} />
                        {resetPasswordLoadingId === u.id ? 'Generating…' : 'Reset Password'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && !loadingUsers && (
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

      <ConfirmModal
        isOpen={!!impersonateTarget}
        title="Start impersonation?"
        message={
          impersonateTarget
            ? `You will act as ${impersonateTarget.email} until you stop impersonation. Continue?`
            : ''
        }
        confirmText="Impersonate"
        onConfirm={() => {
          if (impersonateTarget) {
            void startImpersonation(impersonateTarget);
          }
          setImpersonateTarget(null);
        }}
        onCancel={() => setImpersonateTarget(null)}
      />

      <ConfirmModal
        isOpen={!!resetPasswordResult}
        title="Temporary password"
        message={
          resetPasswordResult ? (
            <div className="space-y-3">
              <div className="text-xs">
                Temporary password for <span className="font-bold text-slate-900 dark:text-neutral-100">{resetPasswordResult.email}</span>. They will be prompted to set a new password after signing in.
              </div>
              <div className="px-3 py-2 rounded-xl border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono text-sm text-slate-900 dark:text-neutral-100 break-all">
                {resetPasswordResult.tempPassword}
              </div>
            </div>
          ) : (
            ''
          )
        }
        confirmText="Copy"
        cancelText="Close"
        isDangerous={false}
        variant="success"
        onConfirm={() => {
          if (!resetPasswordResult) return;
          void navigator.clipboard?.writeText(resetPasswordResult.tempPassword);
          setResetPasswordResult(null);
        }}
        onCancel={() => setResetPasswordResult(null)}
      />
    </Layout>
  );
};
