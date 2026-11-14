import React, { createContext, useContext, useEffect, useState } from "react";
import type { ThemePreference } from "../api";
import { usePreference } from "./PreferencesContext";

type Theme = "light" | "dark";

interface ThemeContextType {
  /** Resolved theme the UI renders with; `system` is never exposed here. */
  theme: Theme;
  /** What the user picked: an explicit theme or follow the OS. */
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
  /** Flip to the opposite of the resolved theme and store it as an explicit choice. */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

const getDarkSchemeQuery = (): MediaQueryList | null =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(DARK_SCHEME_QUERY)
    : null;

const readSystemTheme = (): Theme =>
  getDarkSchemeQuery()?.matches ? "dark" : "light";

const useSystemTheme = (): Theme => {
  const [systemTheme, setSystemTheme] = useState<Theme>(readSystemTheme);

  useEffect(() => {
    const mq = getDarkSchemeQuery();
    if (!mq) return;
    const sync = () => setSystemTheme(mq.matches ? "dark" : "light");
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return systemTheme;
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // Server-backed via the shared preferences context (no-clobber-on-first-mount
  // and refetch-on-user-change live there); this wrapper only owns the DOM side
  // effects for the resolved theme. Users without a stored choice follow the OS,
  // so the login page and new accounts pick up the system theme automatically.
  const [themePreference, setThemePreference] = usePreference(
    "theme",
    "system",
  );
  const systemTheme = useSystemTheme();
  const theme: Theme =
    themePreference === "system" ? systemTheme : themePreference;

  useEffect(() => {
    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (link) {
      link.href = theme === "dark" ? "/favicon-dark.svg" : "/favicon-light.svg";
    }

    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  const toggleTheme = () => {
    setThemePreference(theme === "light" ? "dark" : "light");
  };

  return (
    <ThemeContext.Provider
      value={{ theme, themePreference, setThemePreference, toggleTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
