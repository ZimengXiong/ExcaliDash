import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Logo } from '../components/Logo';
import * as api from '../api';

/**
 * Two very different pages behind one route: a server that can deliver mail
 * offers the reset form, one that cannot says so plainly instead of asking
 * for an address it will never write to.
 */
export const PasswordResetRequest: React.FC = () => {
  const { passwordResetEnabled } = useAuth();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.authPasswordResetRequest(email);
      // The reply is deliberately identical for known and unknown addresses.
      setSubmitted(true);
    } catch {
      setError('Could not request a reset right now. Please try again later.');
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
            {passwordResetEnabled ? 'Reset your password' : 'Password help'}
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {passwordResetEnabled
              ? 'Enter your email address and we will send you a reset link.'
              : 'This server does not send password reset emails.'}
          </p>
        </div>

        <div className="mt-8 space-y-6">
          {passwordResetEnabled ? (
            submitted ? (
              <div className="rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 text-left space-y-3">
                <div className="text-sm text-gray-700 dark:text-gray-200">
                  If an account with that email exists, a password reset link has been sent.
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-300">
                  The link is valid for 60 minutes and can be used once.
                </div>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-200"
                  >
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="you@example.com"
                  />
                </div>

                {error && (
                  <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
                >
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            )
          ) : (
            <div className="rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 text-left space-y-3">
              <div className="text-sm text-gray-700 dark:text-gray-200">
                Contact your administrator and ask them to generate a temporary password from the Admin dashboard.
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-300">
                If you are an admin and you’re locked out, run:
              </div>
              <pre className="text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-3 overflow-x-auto">
cd backend && node scripts/admin-recover.cjs --identifier you@example.com --generate --activate --disable-login-rate-limit
              </pre>
            </div>
          )}

          <div className="text-center">
            <Link
              to="/login"
              className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400"
            >
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
