import React, { useEffect, useMemo } from "react";
import { resolveLocale, translate } from "../i18n";
import { LocaleContext, type LocaleContextValue } from "./localeContext";
import { usePreference } from "./PreferencesContext";

export const LocaleProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const defaultLanguage =
    typeof navigator === "undefined" ? "en" : navigator.language;
  const [language, setLanguage] = usePreference("language", defaultLanguage);
  const locale = resolveLocale(language);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      language,
      setLanguage,
      t: (key) => translate(locale, key),
    }),
    [locale, language, setLanguage],
  );
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
};
