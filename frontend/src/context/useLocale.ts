import { useContext } from "react";
import { DEFAULT_LOCALE, translate } from "../i18n";
import { LocaleContext, type LocaleContextValue } from "./localeContext";

// Used when a component renders without LocaleProvider (isolated editor
// tests, for instance): English text instead of a crash.
const fallbackLocale: LocaleContextValue = {
  locale: DEFAULT_LOCALE,
  language: DEFAULT_LOCALE,
  setLanguage: () => {},
  t: (key, params) => translate(DEFAULT_LOCALE, key, params),
};

export const useLocale = (): LocaleContextValue =>
  useContext(LocaleContext) ?? fallbackLocale;
