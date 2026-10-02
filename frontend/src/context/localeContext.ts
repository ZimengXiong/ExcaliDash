import { createContext } from "react";
import type { Locale, TranslationKey } from "../i18n";

export type LocaleContextValue = {
  locale: Locale;
  language: string;
  setLanguage: (language: string) => void;
  t: (key: TranslationKey) => string;
};

export const LocaleContext = createContext<LocaleContextValue | null>(null);
