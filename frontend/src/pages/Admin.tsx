import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBeforeUnload, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import type { Collection } from '../types';
import { UserPlus, RefreshCw, UserCog } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { getPasswordPolicy, validatePassword } from '../utils/passwordPolicy';
import { PasswordRequirements } from '../components/PasswordRequirements';
import { AccessControlCard } from './admin/AccessControlCard';
import { LoginRateLimitCard } from './admin/LoginRateLimitCard';
import { UserActionModals } from './admin/UserActionModals';
import { UsersTable } from './admin/UsersTable';
import type { AdminUser } from './admin/types';
import {
  IMPERSONATION_KEY,
  type ImpersonationState,
  readImpersonationState,
  USER_KEY,
} from '../utils/impersonation';

type LoginRateLimitFormState = {
  enabled: boolean;
  windowMinutes: number;
  max: number;
};

const sanitizePositiveInt = (value: number, fallback = 1) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value));
};

export const Admin: React.FC = () => {
  const navigate = useNavigate();
  const { user: authUser, authEnabled } = useAuth();
  const isAdmin = authUser?.role === 'ADMIN';
  const passwordPolicy = getPasswordPolicy();

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
  const [createOidcOnly, setCreateOidcOnly] = useState(false);
  const [createRole, setCreateRole] = useState<'ADMIN' | 'USER'>('USER');
  const [createMustReset, setCreateMustReset] = useState(true);
  const [createActive, setCreateActive] = useState(true);

  const [impersonateTarget, setImpersonateTarget] = useState<AdminUser | null>(null);
  const [resetPasswordLoadingId, setResetPasswordLoadingId] = useState<string | null>(null);
  const [resetPasswordResult, setResetPasswordResult] = useState<{ email: string; tempPassword: string } | null>(null);

  const [registrationEnabled, setRegistrationEnabled] = useState<boolean | null>(null);
  const [localRegistrationAllowed, setLocalRegistrationAllowed] = useState(true);
  const [oidcEnabled, setOidcEnabled] = useState(false);
  const [oidcJitProvisioningEnabled, setOidcJitProvisioningEnabled] = useState<boolean | null>(null);
  const [oidcProviderName, setOidcProviderName] = useState<string | null>(null);
  const [registrationLoading, setRegistrationLoading] = useState(false);

  const [loginRateLimitLoading, setLoginRateLimitLoading] = useState(false);
  const [loginRateLimitSaving, setLoginRateLimitSaving] = useState(false);
  const [loginRateLimitEnabled, setLoginRateLimitEnabled] = useState(true);
  const [loginRateLimitWindowMinutes, setLoginRateLimitWindowMinutes] = useState(15);
  const [loginRateLimitMax, setLoginRateLimitMax] = useState(20);
  const [savedLoginRateLimit, setSavedLoginRateLimit] = useState<LoginRateLimitFormState | null>(null);
  const [loginRateLimitAutoSaveQueued, setLoginRateLimitAutoSaveQueued] = useState(false);
  const lastAutoSaveAttemptKeyRef = useRef<string | null>(null);
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const normalizedLoginRateLimit = useMemo<LoginRateLimitFormState>(
    () => ({
      enabled: loginRateLimitEnabled,
      windowMinutes: sanitizePositiveInt(loginRateLimitWindowMinutes),
      max: sanitizePositiveInt(loginRateLimitMax),
    }),
    [loginRateLimitEnabled, loginRateLimitWindowMinutes, loginRateLimitMax]
  );

  const loginRateLimitDirty = Boolean(
    savedLoginRateLimit &&
      (savedLoginRateLimit.enabled !== normalizedLoginRateLimit.enabled ||
        savedLoginRateLimit.windowMinutes !== normalizedLoginRateLimit.windowMinutes ||
        savedLoginRateLimit.max !== normalizedLoginRateLimit.max)
  );

  const hasPendingLoginRateLimitChanges = loginRateLimitDirty || loginRateLimitSaving || loginRateLimitAutoSaveQueued;
  const normalizedLoginRateLimitKey = `${normalizedLoginRateLimit.enabled}:${normalizedLoginRateLimit.windowMinutes}:${normalizedLoginRateLimit.max}`;

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

  const loadRegistrationStatus = async () => {
    setRegistrationLoading(true);
    try {
      const response = await api.api.get<{
        registrationEnabled: boolean;
        authMode?: 'local' | 'hybrid' | 'oidc_enforced';
        oidcEnabled?: boolean;
        oidcProvider?: string;
        oidcJitProvisioningEnabled?: boolean;
      }>('/auth/status');
      setRegistrationEnabled(Boolean(response.data.registrationEnabled));
      setLocalRegistrationAllowed(response.data.authMode !== 'oidc_enforced');
      setOidcEnabled(Boolean(response.data.oidcEnabled));
      setOidcProviderName(
        typeof response.data.oidcProvider === 'string' ? response.data.oidcProvider : null
      );
      setOidcJitProvisioningEnabled(
        typeof response.data.oidcJitProvisioningEnabled === 'boolean'
          ? response.data.oidcJitProvisioningEnabled
          : null
      );
    } catch (err: unknown) {
      let message = 'Failed to load registration status';
      if (api.isAxiosError(err)) {
        message = err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    } finally {
      setRegistrationLoading(false);
    }
  };

  const toggleRegistration = async () => {
    if (!isAdmin || registrationEnabled === null || !localRegistrationAllowed) return;

    setRegistrationLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.api.post<{ registrationEnabled: boolean }>('/auth/registration/toggle', {
        enabled: !registrationEnabled,
      });
      setRegistrationEnabled(Boolean(response.data.registrationEnabled));
      setSuccess(response.data.registrationEnabled ? 'Registration enabled' : 'Registration disabled');
    } catch (err: unknown) {
      let message = 'Failed to update registration setting';
      if (api.isAxiosError(err)) {
        message = err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    } finally {
      setRegistrationLoading(false);
    }
  };

  const toggleOidcJitProvisioning = async () => {
    if (!isAdmin || !oidcEnabled || oidcJitProvisioningEnabled === null) return;

    setRegistrationLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.api.post<{ oidcJitProvisioningEnabled: boolean }>(
        '/auth/oidc/jit-provisioning',
        { enabled: !oidcJitProvisioningEnabled }
      );
      setOidcJitProvisioningEnabled(Boolean(response.data.oidcJitProvisioningEnabled));
      setSuccess(
        response.data.oidcJitProvisioningEnabled
          ? 'OIDC auto-provisioning enabled'
          : 'OIDC access is now invite-only'
      );
    } catch (err: unknown) {
      let message = 'Failed to update OIDC provisioning setting';
      if (api.isAxiosError(err)) {
        message = err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    } finally {
      setRegistrationLoading(false);
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
    setSavedLoginRateLimit(null);
    setLoginRateLimitAutoSaveQueued(false);
    lastAutoSaveAttemptKeyRef.current = null;
    try {
      const response = await api.api.get<{
        config: { enabled: boolean; windowMs: number; max: number };
      }>('/auth/rate-limit/login');
      const cfg = response.data.config;
      const nextConfig: LoginRateLimitFormState = {
        enabled: Boolean(cfg.enabled),
        windowMinutes: sanitizePositiveInt(Number(cfg.windowMs) / 60000),
        max: sanitizePositiveInt(Number(cfg.max)),
      };
      setLoginRateLimitEnabled(nextConfig.enabled);
      setLoginRateLimitWindowMinutes(nextConfig.windowMinutes);
      setLoginRateLimitMax(nextConfig.max);
      setSavedLoginRateLimit(nextConfig);
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

  const saveLoginRateLimitConfig = useCallback(async () => {
    if (loginRateLimitSaving) return;
    setLoginRateLimitSaving(true);
    setError('');
    try {
      const payload = {
        enabled: normalizedLoginRateLimit.enabled,
        windowMs: Math.max(10_000, Math.round(normalizedLoginRateLimit.windowMinutes * 60_000)),
        max: sanitizePositiveInt(normalizedLoginRateLimit.max),
      };
      const response = await api.api.put<{
        config: { enabled: boolean; windowMs: number; max: number };
      }>('/auth/rate-limit/login', payload);

      const cfg = response.data.config;
      const nextConfig: LoginRateLimitFormState = {
        enabled: Boolean(cfg.enabled),
        windowMinutes: sanitizePositiveInt(Number(cfg.windowMs) / 60000),
        max: sanitizePositiveInt(Number(cfg.max)),
      };
      setLoginRateLimitEnabled(nextConfig.enabled);
      setLoginRateLimitWindowMinutes(nextConfig.windowMinutes);
      setLoginRateLimitMax(nextConfig.max);
      setSavedLoginRateLimit(nextConfig);
      setLoginRateLimitAutoSaveQueued(false);
      toast.success('Login rate limit changes saved');
    } catch (err: unknown) {
      let message = 'Failed to save rate limit config';
      if (api.isAxiosError(err)) {
        message = err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    } finally {
      setLoginRateLimitSaving(false);
    }
  }, [loginRateLimitSaving, normalizedLoginRateLimit]);

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
    void loadRegistrationStatus();
  }, [authEnabled, isAdmin]);

  useEffect(() => {
    if (!authEnabled || !isAdmin) return;
    if (!savedLoginRateLimit || !loginRateLimitDirty || loginRateLimitSaving) return;
    if (lastAutoSaveAttemptKeyRef.current === normalizedLoginRateLimitKey) return;

    setLoginRateLimitAutoSaveQueued(true);
    const timeoutId = window.setTimeout(() => {
      setLoginRateLimitAutoSaveQueued(false);
      lastAutoSaveAttemptKeyRef.current = normalizedLoginRateLimitKey;
      void saveLoginRateLimitConfig();
    }, 900);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    authEnabled,
    isAdmin,
    savedLoginRateLimit,
    loginRateLimitDirty,
    loginRateLimitSaving,
    normalizedLoginRateLimitKey,
    saveLoginRateLimitConfig,
  ]);

  useEffect(() => {
    if (!loginRateLimitDirty) {
      setLoginRateLimitAutoSaveQueued(false);
      lastAutoSaveAttemptKeyRef.current = null;
    }
  }, [loginRateLimitDirty]);

  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (!hasPendingLoginRateLimitChanges) return;
        event.preventDefault();
        event.returnValue = '';
      },
      [hasPendingLoginRateLimitChanges]
    )
  );

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

    const passwordError = createOidcOnly ? null : validatePassword(createPassword, passwordPolicy);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    try {
      const payload = {
        email: createEmail.trim().toLowerCase(),
        name: createName.trim(),
        username: createUsername.trim() ? createUsername.trim() : undefined,
        password: createOidcOnly ? undefined : createPassword,
        oidcOnly: createOidcOnly,
        role: createRole,
        mustResetPassword: createOidcOnly ? false : createMustReset,
        isActive: createActive,
      };

      const response = await api.api.post<{ user: AdminUser }>('/auth/users', payload);
      setUsers(prev => [...prev, response.data.user].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      setSuccess('User created');
      setCreateEmail('');
      setCreateName('');
      setCreateUsername('');
      setCreatePassword('');
      setCreateOidcOnly(false);
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
              <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">Account Type</label>
              <button
                type="button"
                onClick={() => {
                  const next = !createOidcOnly;
                  setCreateOidcOnly(next);
                  if (next) setCreateMustReset(false);
                }}
                disabled={!oidcEnabled}
                className={`w-full px-4 py-3 rounded-xl border-2 font-bold transition-all text-sm ${
                  createOidcOnly
                    ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200'
                    : 'border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-300'
                } ${!oidcEnabled ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {createOidcOnly ? 'OIDC-only invite' : 'Local password account'}
              </button>
              <p className="mt-2 text-xs text-slate-500 dark:text-neutral-400">
                {createOidcOnly
                  ? 'This user can sign in through OIDC when the IdP email matches. No local password is stored.'
                  : 'This user can sign in with a local password.'}
              </p>
            </div>

            {!createOidcOnly && (
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">Temporary Password</label>
                <input
                  type="password"
                  value={createPassword}
                  onChange={e => setCreatePassword(e.target.value)}
                  minLength={passwordPolicy.minLength}
                  maxLength={passwordPolicy.maxLength}
                  pattern={passwordPolicy.patternHtml}
                  required
                  className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white outline-none"
                />
                <PasswordRequirements
                  password={createPassword}
                  policy={passwordPolicy}
                  className="text-slate-600 dark:text-neutral-400"
                />
              </div>
            )}

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

            <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
              <div className="flex-1 w-full">
                <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">Password Reset</label>
                <button
                  type="button"
                  onClick={() => !createOidcOnly && setCreateMustReset(!createMustReset)}
                  disabled={createOidcOnly}
                  className={`w-full px-4 py-3 rounded-xl border-2 font-bold transition-all text-sm ${
                    createMustReset
                      ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200'
                      : 'border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-300'
                  } ${createOidcOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {createOidcOnly ? 'Not used for OIDC-only' : createMustReset ? 'Must reset password' : 'No reset required'}
                </button>
              </div>
              <div className="flex-1 w-full">
                <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">Account Status</label>
                <button
                  type="button"
                  onClick={() => setCreateActive(!createActive)}
                  className={`w-full px-4 py-3 rounded-xl border-2 font-bold transition-all text-sm ${
                    createActive
                      ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-300'
                  }`}
                >
                  {createActive ? 'Active' : 'Inactive'}
                </button>
              </div>
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

      <AccessControlCard
        registrationEnabled={registrationEnabled}
        localRegistrationAllowed={localRegistrationAllowed}
        oidcEnabled={oidcEnabled}
        oidcProviderName={oidcProviderName}
        oidcJitProvisioningEnabled={oidcJitProvisioningEnabled}
        loading={registrationLoading}
        onToggleRegistration={toggleRegistration}
        onToggleOidcJitProvisioning={toggleOidcJitProvisioning}
      />

      <LoginRateLimitCard
        loading={loginRateLimitLoading}
        saving={loginRateLimitSaving}
        autoSaveQueued={loginRateLimitAutoSaveQueued}
        dirty={loginRateLimitDirty}
        enabled={loginRateLimitEnabled}
        windowMinutes={loginRateLimitWindowMinutes}
        maxAttempts={loginRateLimitMax}
        resetIdentifier={resetIdentifier}
        resetLoading={resetLoading}
        userEmails={users.map((user) => user.email)}
        onToggleEnabled={() => setLoginRateLimitEnabled(!loginRateLimitEnabled)}
        onWindowMinutesChange={setLoginRateLimitWindowMinutes}
        onMaxAttemptsChange={setLoginRateLimitMax}
        onResetIdentifierChange={setResetIdentifier}
        onReset={resetLoginRateLimit}
      />

      <UsersTable
        users={users}
        loading={loadingUsers}
        currentUserId={authUser?.id}
        resetPasswordLoadingId={resetPasswordLoadingId}
        onRoleChange={(user, role) => patchUser(user.id, { role })}
        onToggleActive={(user) => patchUser(user.id, { isActive: !user.isActive })}
        onToggleMustReset={(user) =>
          patchUser(user.id, { mustResetPassword: !user.mustResetPassword })
        }
        onImpersonate={setImpersonateTarget}
        onResetPassword={generateTempPassword}
      />

      <UserActionModals
        impersonateTarget={impersonateTarget}
        resetPasswordResult={resetPasswordResult}
        onConfirmImpersonation={startImpersonation}
        onCancelImpersonation={() => setImpersonateTarget(null)}
        onCopyPassword={(result) => navigator.clipboard?.writeText(result.tempPassword)}
        onClosePassword={() => setResetPasswordResult(null)}
      />
      <Toaster position="bottom-center" />
    </Layout>
  );
};
