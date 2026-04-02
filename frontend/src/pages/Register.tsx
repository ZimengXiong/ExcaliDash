import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Check, Copy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Logo } from '../components/Logo';
import * as api from '../api';
import { getPasswordPolicy, validatePassword } from '../utils/passwordPolicy';
import { PasswordRequirements } from '../components/PasswordRequirements';
import { AuthStatusErrorPanel } from '../components/AuthStatusErrorPanel';

export const Register: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedBootstrapCmd, setCopiedBootstrapCmd] = useState(false);
  const {
    register,
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
  } = useAuth();
  const navigate = useNavigate();

  const passwordPolicy = getPasswordPolicy();

  const bootstrapLogsCommand =
    'docker compose -f docker-compose.prod.yml logs backend --tail=200 | grep "BOOTSTRAP SETUP"';

  const copyBootstrapCommand = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(bootstrapLogsCommand);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = bootstrapLogsCommand;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedBootstrapCmd(true);
      window.setTimeout(() => setCopiedBootstrapCmd(false), 1500);
    } catch {
    }
  };

  useEffect(() => {
    if (authStatusError) return;
    if (authLoading || authEnabled === null) return;
    if (authOnboardingRequired) {
      navigate('/auth-setup', { replace: true });
      return;
    }
    if (oidcEnforced) {
      api.startOidcSignIn('/');
      return;
    }
    if (!authEnabled) {
      navigate('/', { replace: true });
      return;
    }
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [authEnabled, authLoading, authOnboardingRequired, authStatusError, isAuthenticated, navigate, oidcEnforced]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const passwordError = validatePassword(password, passwordPolicy);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (bootstrapRequired && setupCode.trim().length === 0) {
      setError('Bootstrap setup code is required');
      return;
    }

    setLoading(true);

    try {
      await register(email, password, name, bootstrapRequired ? setupCode : undefined);
      navigate('/');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to register';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleOidcBootstrap = () => {
    setError('');
    api.startOidcSignIn('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <Logo className="mx-auto h-12 w-auto" />
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900 dark:text-white">
            {bootstrapRequired ? 'Set up admin account' : 'Create your account'}
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {bootstrapRequired ? (
              <span>
                Set up your first admin account to finish enabling multi-user access for this
                ExcaliDash instance.
              </span>
            ) : (
              <>
                Or{' '}
                <Link
                  to="/login"
                  className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
                >
                  sign in to your existing account
                </Link>
              </>
            )}
          </p>
          {bootstrapRequired && (
            <div className="mt-3 rounded-md bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-900 dark:text-amber-200 text-left">
              <div className="font-semibold">One-time setup code</div>
              <div className="mt-1 text-amber-800 dark:text-amber-200/90">
                Find it in the backend logs (look for <code>[BOOTSTRAP SETUP]</code>):
              </div>
              <div className="mt-2 rounded bg-amber-100 dark:bg-amber-900/30 p-2">
                <div className="flex items-start gap-2">
                  <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[11px] leading-snug">
                    <code className="select-all">{bootstrapLogsCommand}</code>
                  </pre>
                  <button
                    type="button"
                    onClick={() => void copyBootstrapCommand()}
                    className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded border border-amber-200/80 dark:border-amber-700/60 bg-amber-50/60 dark:bg-amber-900/35 text-amber-900 dark:text-amber-100 hover:bg-amber-50 dark:hover:bg-amber-900/50"
                    aria-label={copiedBootstrapCmd ? 'Copied docker command' : 'Copy docker command'}
                    title={copiedBootstrapCmd ? 'Copied' : 'Copy'}
                  >
                    {copiedBootstrapCmd ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
              <div className="mt-2 text-amber-800 dark:text-amber-200/90">
                If you are not using <code>docker-compose.prod.yml</code>, drop the <code>-f ...</code> flag.
              </div>
            </div>
          )}
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {authStatusError && (
            <AuthStatusErrorPanel message={authStatusError} onRetry={retryAuthStatus} />
          )}
          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
              <div className="text-sm text-red-800 dark:text-red-200">{error}</div>
            </div>
          )}

          {bootstrapRequired && oidcEnabled && !oidcEnforced && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleOidcBootstrap}
                disabled={loading}
                className="group relative w-full flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-700 text-sm font-medium rounded-md text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Set up admin with {oidcProvider || 'OIDC'}
              </button>
              <div className="text-center text-xs text-gray-500 dark:text-gray-400">
                Or create a local admin account below
              </div>
            </div>
          )}

          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label htmlFor="name" className="sr-only">
                Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                required
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white dark:bg-gray-800 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
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
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white dark:bg-gray-800 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
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
                autoComplete="new-password"
                required
                minLength={passwordPolicy.minLength}
                maxLength={passwordPolicy.maxLength}
                pattern={passwordPolicy.patternHtml}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white dark:bg-gray-800 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <PasswordRequirements password={password} policy={passwordPolicy} className="text-gray-600 dark:text-gray-400" />
            </div>
            {bootstrapRequired && (
              <div>
                <label htmlFor="setupCode" className="sr-only">
                  Bootstrap setup code
                </label>
                <input
                  id="setupCode"
                  name="setupCode"
                  type="text"
                  autoComplete="one-time-code"
                  required
                  className="appearance-none relative block w-full px-3 py-2 border border-amber-300 dark:border-amber-700 placeholder-amber-600 dark:placeholder-amber-300 text-gray-900 dark:text-white dark:bg-gray-800 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm uppercase tracking-widest"
                  placeholder="One-time setup code"
                  value={setupCode}
                  onChange={(e) => setSetupCode(e.target.value.toUpperCase())}
                />
              </div>
            )}
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
