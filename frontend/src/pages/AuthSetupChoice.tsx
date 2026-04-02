import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Shield, ShieldOff } from 'lucide-react';
import { Logo } from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { AuthStatusErrorPanel } from '../components/AuthStatusErrorPanel';

type Step = 'choice' | 'confirm-disable';

export const AuthSetupChoice: React.FC = () => {
  const navigate = useNavigate();
  const {
    loading: authLoading,
    authEnabled,
    authStatusError,
    retryAuthStatus,
    bootstrapRequired,
    isAuthenticated,
    authOnboardingRequired,
    authOnboardingMode,
  } = useAuth();

  const [step, setStep] = useState<Step>('choice');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authStatusError) return;
    if (authLoading || authEnabled === null) return;
    if (authOnboardingRequired) return;

    if (!authEnabled) {
      navigate('/', { replace: true });
      return;
    }

    if (bootstrapRequired) {
      navigate('/register', { replace: true });
      return;
    }

    if (isAuthenticated) {
      navigate('/', { replace: true });
      return;
    }

    navigate('/login', { replace: true });
  }, [
    authEnabled,
    authLoading,
    authOnboardingRequired,
    authStatusError,
    bootstrapRequired,
    isAuthenticated,
    navigate,
  ]);

  const isMigrationMode = authOnboardingMode === 'migration';

  const applyChoice = async (enableAuth: boolean) => {
    setSubmitting(true);
    setError('');
    try {
      const response = await api.authOnboardingChoice(enableAuth);
      localStorage.setItem('excalidash-auth-enabled', String(response.authEnabled));

      if (response.authEnabled) {
        window.location.href = response.bootstrapRequired ? '/register' : '/login';
        return;
      }

      window.location.href = '/';
    } catch (err: unknown) {
      let message = 'Failed to apply authentication choice';
      if (api.isAxiosError(err)) {
        message = err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
      setSubmitting(false);
    }
  };

  if (authLoading || authEnabled === null || !authOnboardingRequired) {
    if (authStatusError) {
      return <AuthStatusErrorPanel message={authStatusError} onRetry={retryAuthStatus} fullScreen />;
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 px-4 py-6 flex items-center justify-center">
      <div className="mx-auto w-full max-w-2xl">
        <div className="text-center mb-8">
          <Logo className="mx-auto h-12 w-auto" />
          <h1 className="mt-6 text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white leading-tight">
            {step === 'choice' ? 'Choose Authentication Mode' : 'Keep Authentication Disabled?'}
          </h1>
          <p className="mt-4 text-sm sm:text-base text-gray-600 dark:text-gray-300">
            {step === 'choice'
              ? isMigrationMode
                ? 'We detected existing data from an earlier ExcaliDash version.'
                : 'This looks like a new ExcaliDash setup.'
              : 'This option is only recommended for private, trusted networks.'}
          </p>
        </div>

        <div className="rounded-2xl border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 p-6 sm:p-8 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.15)]">
          {error && (
            <div className="mb-5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-800 dark:text-red-200">
              {error}
            </div>
          )}

          {step === 'choice' ? (
            <>
              <div className="mb-6 rounded-lg border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 p-4 text-sm text-slate-700 dark:text-neutral-200">
                <div className="font-semibold mb-1">Enable authentication now?</div>
                <div>If enabled, users must sign in and you will set up the first admin account.</div>
              </div>

              <div className="mb-6 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-900/20 p-4 text-sm text-emerald-800 dark:text-emerald-200">
                Recommendation: choose <strong>Enable Authentication</strong>.
              </div>

              {isMigrationMode && (
                <div className="mb-6 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-900/20 p-4 text-sm text-blue-800 dark:text-blue-200">
                  ExcaliDash v0.4 adds multi-user and OIDC support. Enabling authentication secures upgraded instances before sharing access.
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    void applyChoice(true);
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl border-2 border-black bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 transition-all disabled:opacity-60"
                >
                  <Shield size={18} />
                  Enable Authentication
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setStep('confirm-disable')}
                  className="flex items-center justify-center gap-2 rounded-xl border-2 border-black bg-white dark:bg-neutral-800 px-4 py-3 text-sm font-bold text-gray-900 dark:text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 transition-all disabled:opacity-60"
                >
                  <ShieldOff size={18} />
                  Keep Disabled
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-6 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-900/20 p-4 text-sm text-rose-800 dark:text-rose-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    With authentication disabled, anyone who can access this instance can use all data and settings.
                    They can also enable authentication themselves and lock you out.
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setStep('choice')}
                  className="rounded-xl border-2 border-black bg-white dark:bg-neutral-800 px-4 py-3 text-sm font-bold text-gray-900 dark:text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 transition-all disabled:opacity-60"
                >
                  Go Back
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    void applyChoice(false);
                  }}
                  className="rounded-xl border-2 border-black bg-rose-600 px-4 py-3 text-sm font-bold text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 transition-all disabled:opacity-60"
                >
                  Confirm Disable Authentication
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
