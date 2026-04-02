import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  authStatus,
  authMe,
  authRefresh,
  authLogout,
  authLogin,
  authRegister,
  isAxiosError,
} from '../api';

interface User {
  id: string;
  username?: string | null;
  email: string;
  name: string;
  role?: "ADMIN" | "USER" | string;
  mustResetPassword?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  authEnabled: boolean | null;
  authStatusError: string | null;
  authMode: 'local' | 'hybrid' | 'oidc_enforced';
  oidcEnabled: boolean;
  oidcEnforced: boolean;
  oidcProvider: string | null;
  bootstrapRequired: boolean;
  authOnboardingRequired: boolean;
  authOnboardingMode: 'migration' | 'fresh' | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, setupCode?: string) => Promise<void>;
  logout: () => void;
  retryAuthStatus: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_KEY = 'excalidash-user';
const AUTH_ENABLED_CACHE_KEY = "excalidash-auth-enabled";

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authEnabled, setAuthEnabled] = useState<boolean | null>(null);
  const [authStatusError, setAuthStatusError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'local' | 'hybrid' | 'oidc_enforced'>('local');
  const [oidcEnabled, setOidcEnabled] = useState(false);
  const [oidcEnforced, setOidcEnforced] = useState(false);
  const [oidcProvider, setOidcProvider] = useState<string | null>(null);
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [authOnboardingRequired, setAuthOnboardingRequired] = useState(false);
  const [authOnboardingMode, setAuthOnboardingMode] = useState<'migration' | 'fresh' | null>(null);
  const navigate = useNavigate();

  const loadUser = useCallback(async () => {
    setLoading(true);
    try {
      const isShareFlow = window.location.pathname.startsWith("/shared/");

      try {
        const statusResponse = await authStatus();
        setAuthStatusError(null);
        const enabled =
          typeof statusResponse?.authEnabled === "boolean"
            ? statusResponse.authEnabled
            : typeof statusResponse?.enabled === "boolean"
              ? statusResponse.enabled
              : true;
        setAuthEnabled(enabled);
        localStorage.setItem(AUTH_ENABLED_CACHE_KEY, String(enabled));
        const nextAuthMode =
          statusResponse?.authMode === 'hybrid' || statusResponse?.authMode === 'oidc_enforced'
            ? statusResponse.authMode
            : 'local';
        setAuthMode(nextAuthMode);
        setOidcEnabled(Boolean(statusResponse?.oidcEnabled));
        setOidcEnforced(Boolean(statusResponse?.oidcEnforced));
        setOidcProvider(typeof statusResponse?.oidcProvider === 'string' ? statusResponse.oidcProvider : null);
        setBootstrapRequired(Boolean(statusResponse?.bootstrapRequired));
        setAuthOnboardingRequired(Boolean(statusResponse?.authOnboardingRequired));
        setAuthOnboardingMode(
          statusResponse?.authOnboardingMode === 'migration' || statusResponse?.authOnboardingMode === 'fresh'
            ? statusResponse.authOnboardingMode
            : null
        );

        if (!enabled) {
          localStorage.removeItem(USER_KEY);
          setUser(null);
          return;
        }
      } catch {
        const cachedAuthEnabled = localStorage.getItem(AUTH_ENABLED_CACHE_KEY);
        if (cachedAuthEnabled === "false") {
          setAuthStatusError(null);
          setAuthEnabled(false);
          setAuthMode('local');
          setOidcEnabled(false);
          setOidcEnforced(false);
          setOidcProvider(null);
          setBootstrapRequired(false);
          setAuthOnboardingRequired(false);
          setAuthOnboardingMode(null);
          localStorage.removeItem(USER_KEY);
          setUser(null);
          return;
        }
        setAuthStatusError(
          "Unable to reach the backend API. Check BACKEND_URL, FRONTEND_URL, and your reverse proxy configuration."
        );
        setAuthEnabled(null);
        setAuthMode('local');
        setOidcEnabled(false);
        setOidcEnforced(false);
        setOidcProvider(null);
        setBootstrapRequired(false);
        setAuthOnboardingRequired(false);
        setAuthOnboardingMode(null);
        localStorage.removeItem(USER_KEY);
        setUser(null);
        return;
      }

      // For share-link flows we treat authentication as strictly server-derived.
      // Loading a stale localStorage user causes "logged-in" UI while the server returns 401s,
      // which in turn triggers noisy refresh attempts and failing library saves.
      if (!isShareFlow) {
        const storedUser = localStorage.getItem(USER_KEY);
        if (storedUser) {
          try {
            const userData = JSON.parse(storedUser);
            setUser(userData);
          } catch {
            localStorage.removeItem(USER_KEY);
            setUser(null);
          }
        }
      }

      try {
        const response = await authMe();
        setUser(response.user);
        localStorage.setItem(USER_KEY, JSON.stringify(response.user));
      } catch {
        if (isShareFlow) {
          localStorage.removeItem(USER_KEY);
          setUser(null);
          return;
        }
        try {
          await authRefresh();
          const userResponse = await authMe();
          setUser(userResponse.user);
          localStorage.setItem(USER_KEY, JSON.stringify(userResponse.user));
        } catch {
          localStorage.removeItem(USER_KEY);
          setUser(null);
        }
      }
    } catch (error) {
      console.error('Failed to load user:', error);
      setAuthStatusError(
        "Unable to initialize authentication state. Check backend/API connectivity and refresh."
      );
      localStorage.removeItem(USER_KEY);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = async (email: string, password: string) => {
    try {
      if (authEnabled === false) {
        throw new Error("Authentication is disabled");
      }
      const response = await authLogin(email, password);

      const { user: userData } = response;

      localStorage.setItem(USER_KEY, JSON.stringify(userData));

      setAuthStatusError(null);
      setAuthEnabled(true);
      setUser(userData);
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        const message =
          typeof error.response?.data === 'object' &&
          error.response.data !== null &&
          'message' in error.response.data &&
          typeof error.response.data.message === 'string'
            ? error.response.data.message
            : 'Login failed';
        throw new Error(message);
      }
      throw error instanceof Error ? error : new Error('Login failed');
    }
  };

  const register = async (email: string, password: string, name: string, setupCode?: string) => {
    try {
      if (authEnabled === false) {
        throw new Error("Authentication is disabled");
      }
      const response = await authRegister(email, password, name, setupCode);

      const { user: userData } = response;

      localStorage.setItem(USER_KEY, JSON.stringify(userData));

      setAuthStatusError(null);
      setAuthEnabled(true);
      setUser(userData);
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        const message =
          typeof error.response?.data === 'object' &&
          error.response.data !== null &&
          'message' in error.response.data &&
          typeof error.response.data.message === 'string'
            ? error.response.data.message
            : 'Registration failed';
        throw new Error(message);
      }
      throw error instanceof Error ? error : new Error('Registration failed');
    }
  };

  const logout = () => {
    void authLogout().catch(() => undefined);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    setTimeout(() => {
      navigate('/login');
    }, 0);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authEnabled,
        authStatusError,
        authMode,
        oidcEnabled,
        oidcEnforced,
        oidcProvider,
        bootstrapRequired,
        authOnboardingRequired,
        authOnboardingMode,
        login,
        register,
        logout,
        retryAuthStatus: loadUser,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
