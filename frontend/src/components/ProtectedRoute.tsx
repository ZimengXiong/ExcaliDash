import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { startOidcSignIn } from '../api';
import { AuthStatusErrorPanel } from './AuthStatusErrorPanel';

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
      return <AuthStatusErrorPanel message={authStatusError} onRetry={retryAuthStatus} fullScreen />;
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
