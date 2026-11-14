import React, { useEffect, useMemo } from "react";
import { resolveLocale, setCurrentLocale, translate } from "../i18n";
import { LocaleContext, type LocaleContextValue } from "./localeContext";
import { usePreference } from "./PreferencesContext";

export const LocaleProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const defaultLanguage =
    typeof navigator === "undefined" ? "en" : navigator.language;
  const [language, setLanguage] = usePreference("language", defaultLanguage);
  const locale = resolveLocale(language);
  // Assigned during render so callers outside React see the new locale
  // before any child re-renders with it.
  setCurrentLocale(locale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      language,
      setLanguage,
      t: (key, params) => translate(locale, key, params),
    }),
    [locale, language, setLanguage],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
};
