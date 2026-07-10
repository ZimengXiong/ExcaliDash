import React, { createContext, useContext, useEffect, useState } from 'react';
import * as api from '../api';
import { useAuth } from './AuthContext';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : 'light';
  });

  // Re-fetch whenever the authenticated user id changes so per-user theme
  // applies on login/switch without a hard refresh.
  useEffect(() => {
    let cancelled = false;
    api.getUserPreferences()
      .then((preferences) => {
        if (cancelled) return;
        if (preferences.theme === 'dark' || preferences.theme === 'light') {
          setTheme(preferences.theme);
        }
      })
      .catch(() => {
        // Anonymous/local pre-login screens keep using localStorage.
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    localStorage.setItem('theme', theme);

    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (link) {
      link.href = theme === 'dark' ? '/favicon-dark.svg' : '/favicon-light.svg';
    }

    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      api.updateUserPreferences({ theme: next }).catch(() => {
        // Keep local preference even when the user is anonymous/offline.
      });
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
