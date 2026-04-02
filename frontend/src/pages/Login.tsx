import React, { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Logo } from '../components/Logo';
import * as api from '../api';
import { USER_KEY } from '../utils/impersonation';
import { getPasswordPolicy, validatePassword } from '../utils/passwordPolicy';
import { PasswordRequirements } from '../components/PasswordRequirements';
import { AuthStatusErrorPanel } from '../components/AuthStatusErrorPanel';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const {
    login,
    logout,
    authEnabled,
    authStatusError,
    retryAuthStatus,
    oidcEnabled,
    oidcEnforced,
    oidcProvider,
    bootstrapRequired,
    authOnboardingRequired,
    isAuthenticated,
    loading: authLoading,
    user,
  } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryMustReset = searchParams.get('mustReset') === '1';
  const oidcErrorCode = searchParams.get('oidcError');
  const oidcErrorMessage = searchParams.get('oidcErrorMessage');
  const oidcReturnTo = searchParams.get('returnTo') || '/';
  const mustReset = Boolean(user?.mustResetPassword) || queryMustReset;
  const passwordPolicy = getPasswordPolicy();

  useEffect(() => {
    if (!oidcErrorCode) return;
    setError(oidcErrorMessage || 'OIDC sign-in failed');
  }, [oidcErrorCode, oidcErrorMessage]);

  useEffect(() => {
    if (authStatusError) return;
    if (authLoading || authEnabled === null) return;
    if (authOnboardingRequired) {
      navigate('/auth-setup', { replace: true });
      return;
    }
    if (!authEnabled) {
      navigate('/', { replace: true });
      return;
    }
    if (bootstrapRequired) {
      navigate('/register', { replace: true });
      return;
    }
    if (oidcEnforced && !mustReset) {
      if (!oidcErrorCode) {
        api.startOidcSignIn(oidcReturnTo);
      }
      return;
    }
    if (isAuthenticated) {
      if (mustReset) return;
      navigate('/', { replace: true });
    }
  }, [
    authEnabled,
    authLoading,
    authOnboardingRequired,
    authStatusError,
    bootstrapRequired,
    isAuthenticated,
    mustReset,
    navigate,
    oidcEnforced,
    oidcErrorCode,
    oidcReturnTo,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      const stored = localStorage.getItem(USER_KEY);
      const storedUser = stored ? (JSON.parse(stored) as { mustResetPassword?: boolean } | null) : null;
      if (storedUser?.mustResetPassword) {
        setPassword('');
        return;
      }
      navigate('/');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to login';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleMustReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!newPassword || !confirmNewPassword) {
      setError('Please enter and confirm a new password');
      return;
    }
    const passwordError = validatePassword(newPassword, passwordPolicy);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const response = await api.api.post<{
        user: { id: string; email: string; name: string; role?: string; mustResetPassword?: boolean };
      }>('/auth/must-reset-password', { newPassword });

      localStorage.setItem(USER_KEY, JSON.stringify(response.data.user));

      window.location.href = '/';
    } catch (err: unknown) {
      let message = 'Failed to reset password';
      if (api.isAxiosError(err)) {
        message = err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <Logo className="mx-auto h-12 w-auto" />
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900 dark:text-white">
            {mustReset
              ? 'Reset your password'
              : oidcEnforced
                ? `Sign in with ${oidcProvider || 'OIDC'}`
                : 'Sign in to your account'}
          </h2>
          {!mustReset && !oidcEnforced ? (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Or{' '}
              <Link
                to="/register"
                className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
              >
                create a new account
              </Link>
            </p>
          ) : mustReset ? (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Your admin requires you to set a new password before using ExcaliDash.
            </p>
          ) : (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              You will be redirected to {oidcProvider || 'your identity provider'}.
            </p>
          )}
        </div>
        <form className="mt-8 space-y-6" onSubmit={mustReset ? handleMustReset : handleSubmit}>
          {authStatusError && (
            <AuthStatusErrorPanel message={authStatusError} onRetry={retryAuthStatus} />
          )}
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
              <div className="text-sm text-red-800 dark:text-red-200">{error}</div>
            </div>
          )}
          {oidcEnforced && !mustReset ? (
            <div>
              <button
                type="button"
                onClick={() => api.startOidcSignIn(oidcReturnTo)}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Continue with {oidcProvider || 'OIDC'}
              </button>
            </div>
          ) : (
            <>
              <div className="rounded-md shadow-sm -space-y-px">
                {!mustReset ? (
                <>
                  <div>
                    <label htmlFor="email" className="sr-only">
                      Email address
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white dark:bg-gray-800 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                      placeholder="Email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="password" className="sr-only">
                      Password
                    </label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white dark:bg-gray-800 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </>
                ) : (
                <>
                  <div>
                    <label htmlFor="newPassword" className="sr-only">
                      New password
                    </label>
                    <input
                      id="newPassword"
                      name="newPassword"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={passwordPolicy.minLength}
                      maxLength={passwordPolicy.maxLength}
                      pattern={passwordPolicy.patternHtml}
                      className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white dark:bg-gray-800 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                      placeholder="New password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="confirmNewPassword" className="sr-only">
                      Confirm new password
                    </label>
                    <input
                      id="confirmNewPassword"
                      name="confirmNewPassword"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={passwordPolicy.minLength}
                      maxLength={passwordPolicy.maxLength}
                      className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white dark:bg-gray-800 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                      placeholder="Confirm new password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                    />
                  </div>
                </>
                )}
              </div>
              {mustReset && (
                <PasswordRequirements
                  password={newPassword}
                  policy={passwordPolicy}
                  className="text-gray-600 dark:text-gray-400"
                />
              )}
            </>
          )}

          {!mustReset && !oidcEnforced && (
            <div className="flex justify-end">
              <Link
                to="/reset-password"
                className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
              >
                Forgot your password?
              </Link>
            </div>
          )}

          {(!oidcEnforced || mustReset) && (
            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {mustReset
                  ? (loading ? 'Updating...' : 'Set new password')
                  : (loading ? 'Signing in...' : 'Sign in')}
              </button>
            </div>
          )}

          {!mustReset && oidcEnabled && !oidcEnforced && (
            <div>
              <button
                type="button"
                onClick={() => api.startOidcSignIn('/')}
                className="group relative w-full flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-700 text-sm font-medium rounded-md text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Continue with {oidcProvider || 'OIDC'}
              </button>
            </div>
          )}

          {mustReset && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setNewPassword('');
                  setConfirmNewPassword('');
                  logout();
                }}
                className="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
              >
                Sign in as a different user
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
