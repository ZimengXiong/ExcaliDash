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
          <p className="mt-3 text-sm text-slate-600 dark:text-neutral-300">
            {step === 'choice'
              ? isMigrationMode
                ? 'Existing data detected.'
                : 'Secure this workspace.'
              : 'Only use this on a trusted network.'}
          </p>
        </div>

        <div className="rounded-2xl border-2 border-slate-800 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-6 sm:p-8 shadow-[3px_3px_0px_0px_rgba(30,41,59,0.9)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.18)]">
          {error && (
            <div className="mb-5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-800 dark:text-red-200">
              {error}
            </div>
          )}

          {step === 'choice' ? (
            <>
              <div className="mb-6 rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 p-4 text-sm text-slate-700 dark:text-neutral-200">
                <div className="font-semibold text-indigo-900 dark:text-indigo-200 mb-1">Secure ExcaliDash</div>
                <div>Create an admin account and restrict access.</div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    void applyChoice(true);
                  }}
                  className="ui-button-primary px-4 py-3"
                >
                  <Shield size={18} />
                  Enable Authentication
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setStep('confirm-disable')}
                  className="ui-button-secondary px-4 py-3"
                >
                  <ShieldOff size={18} />
                  Keep Disabled
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-6 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-900/20 p-4 text-sm text-rose-850 dark:text-rose-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
                  <div>
                    Anyone on this network can access every drawing.
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setStep('choice')}
                  className="ui-button-secondary px-4 py-3"
                >
                  Go Back
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    void applyChoice(false);
                  }}
                  className="ui-button-danger px-4 py-3"
                >
                  Disable Authentication
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
