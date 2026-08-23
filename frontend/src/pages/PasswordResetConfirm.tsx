import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { authPasswordResetConfirm, isAxiosError } from '../api';
import { getPasswordPolicy, validatePassword } from '../utils/passwordPolicy';
import { PasswordRequirements } from '../components/PasswordRequirements';

export const PasswordResetConfirm: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const passwordPolicy = getPasswordPolicy();

  useEffect(() => {
    if (!token) {
      setError('Invalid reset link. Please request a new password reset.');
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const passwordError = validatePassword(password, passwordPolicy);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (!token) {
      setError('Invalid reset token');
      return;
    }

    setLoading(true);

    try {
      await authPasswordResetConfirm(token, password);
      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err: unknown) {
      let message = 'Failed to reset password';
      if (isAxiosError(err)) {
        if (err.response?.status === 404) {
          message = 'Password reset feature is not enabled on this server';
        } else if (err.response?.data?.message) {
          message = err.response.data.message;
        } else if (err.response?.data?.error) {
          message = err.response.data.error;
        } else if (err.message) {
          message = err.message;
        }
      } else if (err instanceof Error) {
        message = err.message;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-wrap">
          <div className="text-center">
            <Logo className="mx-auto h-12 w-auto" />
            <h2 className="auth-heading">
              Password reset successful
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Your password has been reset. Redirecting to login...
            </p>
            <div className="mt-6">
              <Link
                to="/login"
                className="ui-link"
              >
                Go to login
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-wrap">
        <div className="text-center">
          <Logo className="mx-auto h-12 w-auto" />
          <h2 className="auth-heading">
            Set new password
          </h2>
        </div>
        <form className="auth-panel" onSubmit={handleSubmit}>
          {error && (
            <div className="ui-alert-error">
              <div>{error}</div>
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label htmlFor="password" className="sr-only">
                New password
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
                className="ui-input block w-full"
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <PasswordRequirements password={password} policy={passwordPolicy} className="text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="sr-only">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={passwordPolicy.minLength}
                maxLength={passwordPolicy.maxLength}
                className="ui-input block w-full"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading || !token}
              className="ui-button-primary w-full"
            >
              {loading ? 'Resetting...' : 'Reset password'}
            </button>
          </div>

          <div className="text-center">
            <Link
              to="/login"
              className="ui-link"
            >
              Back to login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};
