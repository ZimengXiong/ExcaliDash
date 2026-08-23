import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';

export const PasswordResetRequest: React.FC = () => {
  return (
    <div className="auth-page">
      <div className="auth-wrap">
        <div className="text-center">
          <Logo className="mx-auto h-12 w-auto" />
          <h2 className="auth-heading">
            Password help
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            This server does not send password reset emails.
          </p>
        </div>
        <div className="mt-8 space-y-6">
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

          <div className="text-center">
            <Link
              to="/login"
              className="ui-link"
            >
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
