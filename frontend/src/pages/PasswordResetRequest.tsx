import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import {
  authPasswordResetCapability,
  authPasswordResetRequest,
} from '../api';

export const PasswordResetRequest: React.FC = () => {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    authPasswordResetCapability()
      .then((available) => {
        if (active) setEnabled(available);
      })
      .catch(() => {
        if (active) setEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authPasswordResetRequest(email);
      setSubmitted(true);
    } catch {
      setError('Could not request a reset right now. Try again later.');
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
            {enabled ? 'Reset your password' : 'Password help'}
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {enabled
              ? 'Enter your email address and we’ll send you a reset link.'
              : enabled === null
                ? 'Checking password reset availability…'
                : 'This server does not send password reset emails.'}
          </p>
        </div>

        <div className="mt-8 space-y-6">
          {enabled && !submitted ? (
            <form className="ui-card p-5 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="ui-label" htmlFor="reset-email">Email address</label>
                <input
                  id="reset-email"
                  className="ui-input mt-1"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
              <button className="ui-button ui-button-primary w-full" type="submit" disabled={loading}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          ) : enabled && submitted ? (
            <div className="ui-card p-5 text-sm text-gray-700 dark:text-gray-200">
              If an account with that email exists, a password reset link has been sent. The link is valid for 60 minutes and can be used once.
            </div>
          ) : enabled === false ? (
            <div className="ui-card p-5 text-left space-y-3">
              <div className="text-sm text-gray-700 dark:text-gray-200">
                Ask your administrator for a temporary password.
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-300">
                If you are an admin and you’re locked out, run:
              </div>
              <pre className="text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-3 overflow-x-auto">
cd backend && node scripts/admin-recover.cjs --identifier you@example.com --generate --activate --disable-login-rate-limit
              </pre>
            </div>
          ) : null}

          <div className="text-center">
            <Link to="/login" className="ui-link">Back to login</Link>
          </div>
        </div>
      </div>
    </div>
  );
};
