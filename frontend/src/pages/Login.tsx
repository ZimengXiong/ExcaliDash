import React, { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Logo } from '../components/Logo';
import * as api from '../api';
import { USER_KEY } from '../utils/impersonation';
import { getPasswordPolicy, validatePassword } from '../utils/passwordPolicy';
import { PasswordRequirements } from '../components/PasswordRequirements';
import { AuthStatusErrorPanel } from '../components/AuthStatusErrorPanel';
import { clearOidcAutoLoginSuppression, isOidcAutoLoginSuppressed } from '../utils/oidcLogout';

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
    registrationEnabled,
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
        if (!isOidcAutoLoginSuppressed()) api.startOidcSignIn(oidcReturnTo);
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

  if (authStatusError) {
    return <AuthStatusErrorPanel message={authStatusError} onRetry={retryAuthStatus} fullScreen />;
  }

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
    <div className="auth-page">
      <div className="auth-wrap">
        <div className="text-center">
          <Logo className="mx-auto h-12 w-auto" />
          <h2 className="auth-heading">
            {mustReset
              ? 'Reset your password'
              : oidcEnforced
                ? `Sign in with ${oidcProvider || 'OIDC'}`
                : 'Sign in to your account'}
          </h2>
          {!mustReset && !oidcEnforced && registrationEnabled ? (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Or{' '}
              <Link
                to="/register"
                className="ui-link"
              >
                create a new account
              </Link>
            </p>
          ) : mustReset ? (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Choose a new password to continue.
            </p>
          ) : null}
        </div>
        <form className="auth-panel" onSubmit={mustReset ? handleMustReset : handleSubmit}>
          {error && (
            <div className="ui-alert-error">
              <div>{error}</div>
            </div>
          )}
          {oidcEnforced && !mustReset ? (
            <div>
              <button
                type="button"
                onClick={() => {
                  clearOidcAutoLoginSuppression();
                  api.startOidcSignIn(oidcReturnTo);
                }}
                className="ui-button-primary w-full"
              >
                Continue with {oidcProvider || 'OIDC'}
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-3">
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
                      className="ui-input block w-full"
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
                      className="ui-input block w-full"
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
                      className="ui-input block w-full"
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
                      className="ui-input block w-full"
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
                className="ui-link text-sm"
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
                className="ui-button-primary w-full"
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
                onClick={() => {
                  clearOidcAutoLoginSuppression();
                  api.startOidcSignIn('/');
                }}
                className="ui-button-secondary w-full"
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
                className="ui-link text-sm"
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
