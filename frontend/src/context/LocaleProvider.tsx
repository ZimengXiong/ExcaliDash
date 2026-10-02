import React, { useEffect } from "react";
import { resolveLocale, translate } from "../i18n";
import { LocaleContext } from "./localeContext";
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

  return (
    <LocaleContext.Provider
      value={{
        locale,
        language,
        setLanguage,
        t: (key) => translate(locale, key),
      }}
    >
      {children}
    </LocaleContext.Provider>
  );
};
