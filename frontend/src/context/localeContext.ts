import { createContext } from "react";
import type { Locale, TranslationKey, TranslationParams } from "../i18n";

export type LocaleContextValue = {
  locale: Locale;
  language: string;
  setLanguage: (language: string) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
};

export const LocaleContext = createContext<LocaleContextValue | null>(null);
