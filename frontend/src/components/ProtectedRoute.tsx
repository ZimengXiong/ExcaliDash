import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { startOidcSignIn } from '../api';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const location = useLocation();
  const {
    isAuthenticated,
    loading,
    authEnabled,
    authStatusError,
    retryAuthStatus,
    oidcEnforced,
    bootstrapRequired,
    authOnboardingRequired,
    user,
  } = useAuth();

  const OidcRedirect: React.FC<{ returnTo: string }> = ({ returnTo }) => {
    useEffect(() => {
      startOidcSignIn(returnTo);
    }, [returnTo]);

    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">Redirecting to sign-in...</div>
      </div>
    );
  };

  if (loading || authEnabled === null) {
    if (authStatusError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
          <div className="max-w-lg rounded-md bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-800 dark:text-red-200">
            <div>{authStatusError}</div>
            <button
              type="button"
              onClick={() => void retryAuthStatus()}
              className="mt-3 rounded-md bg-white/80 px-3 py-2 text-xs font-semibold text-red-900 hover:bg-white dark:bg-red-950/40 dark:text-red-100 dark:hover:bg-red-950/70"
            >
              Retry connection
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (authOnboardingRequired && location.pathname !== '/auth-setup') {
    return <Navigate to="/auth-setup" replace />;
  }

  if (!authEnabled) {
    return <>{children}</>;
  }

  if (!isAuthenticated) {
    if (bootstrapRequired) {
      return <Navigate to="/register" replace />;
    }
    if (oidcEnforced) {
      const returnTo = `${location.pathname}${location.search}${location.hash}`;
      return <OidcRedirect returnTo={returnTo} />;
    }

    // Allow sharing the "normal" editor URL: if someone opens `/editor/:id` without being signed in,
    // bounce them to the public editor route (`/shared/:id`), where backend link-sharing policy applies.
    if (location.pathname.startsWith("/editor/")) {
      const id = location.pathname.slice("/editor/".length).split("/")[0] || "";
      if (id) {
        return <Navigate to={`/shared/${id}${location.search}${location.hash}`} replace />;
      }
    }

    return <Navigate to="/login" replace />;
  }

  if (user?.mustResetPassword && location.pathname !== '/login') {
    return <Navigate to="/login?mustReset=1" replace />;
  }

  return <>{children}</>;
};
