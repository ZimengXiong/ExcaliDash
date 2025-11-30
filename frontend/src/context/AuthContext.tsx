import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { AuthState } from '../types';
import { api } from '../api';

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: { displayName?: string; email?: string; currentPassword?: string; newPassword?: string }) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'excalidash_token';
const USER_KEY = 'excalidash_user';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
  });

  // Initialize from localStorage
  useEffect(() => {
    const initAuth = async () => {
      const savedToken = localStorage.getItem(TOKEN_KEY);
      const savedUser = localStorage.getItem(USER_KEY);

      if (savedToken && savedUser) {
        try {
          // Set token for API calls
          api.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
          
          // Verify token is still valid
          const response = await api.get('/auth/me');
          const user = response.data.user;

          setState({
            user,
            token: savedToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          // Token invalid, clear storage
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
          delete api.defaults.headers.common['Authorization'];
          setState({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    initAuth();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password });
    const { user, token } = response.data;

    // Save to localStorage
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));

    // Set token for future API calls
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    setState({
      user,
      token,
      isAuthenticated: true,
      isLoading: false,
    });
  }, []);

  const register = useCallback(async (
    email: string, 
    password: string, 
    displayName?: string
  ) => {
    const response = await api.post('/auth/register', {
      email,
      password,
      displayName,
    });
    const { user, token } = response.data;

    // Save to localStorage
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));

    // Set token for future API calls
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    setState({
      user,
      token,
      isAuthenticated: true,
      isLoading: false,
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      // Ignore errors during logout
    }

    // Clear storage and state
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    delete api.defaults.headers.common['Authorization'];

    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }, []);

  const updateProfile = useCallback(async (data: { 
    displayName?: string; 
    currentPassword?: string; 
    newPassword?: string 
  }) => {
    const response = await api.put('/auth/me', data);
    const updatedUser = response.data.user;

    setState(prev => ({
      ...prev,
      user: updatedUser,
    }));

    // Update localStorage
    localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
  }, []);

  const refreshUser = useCallback(async () => {
    if (!state.token) return;

    try {
      const response = await api.get('/auth/me');
      const user = response.data.user;

      setState(prev => ({
        ...prev,
        user,
      }));

      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (error) {
      // If refresh fails, logout
      await logout();
    }
  }, [state.token, logout]);

  const value: AuthContextType = {
    ...state,
    login,
    register,
    logout,
    updateProfile,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Helper hook for requiring authentication
export const useRequireAuth = (redirectUrl = '/login') => {
  const auth = useAuth();
  
  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      window.location.href = redirectUrl;
    }
  }, [auth.isLoading, auth.isAuthenticated, redirectUrl]);

  return auth;
};

// Helper hook for requiring admin role
export const useRequireAdmin = (redirectUrl = '/') => {
  const auth = useAuth();
  
  useEffect(() => {
    if (!auth.isLoading && (!auth.isAuthenticated || auth.user?.role !== 'ADMIN')) {
      window.location.href = redirectUrl;
    }
  }, [auth.isLoading, auth.isAuthenticated, auth.user?.role, redirectUrl]);

  return auth;
};
