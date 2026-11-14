import { en, type LocaleMessages, type TranslationKey } from "./locales/en";
import { fr } from "./locales/fr";
import { zhCN } from "./locales/zh-CN";

export type { TranslationKey };

const messages = {
  en,
  fr,
  "zh-CN": zhCN,
} satisfies Record<string, LocaleMessages>;

export type Locale = keyof typeof messages;
export type TranslationParams = Record<string, string | number>;

export const DEFAULT_LOCALE: Locale = "en";
export const SUPPORTED_LOCALES = Object.keys(messages) as Locale[];

// Each language is labelled in its own script so users can always find it.
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  fr: "Français",
  "zh-CN": "简体中文",
};

// Code stored in the "language" preference, which the Excalidraw editor also
// reads. Excalidraw only knows some languages by a region code ("fr-FR").
export const LOCALE_LANGUAGE_CODES: Record<Locale, string> = {
  en: "en",
  fr: "fr-FR",
  "zh-CN": "zh-CN",
};

// The locale whose stored code is `value`, if any ("fr-FR" or "fr" -> "fr").
export const localeForLanguageCode = (value: string): Locale | undefined =>
  SUPPORTED_LOCALES.find(
    (locale) => locale === value || LOCALE_LANGUAGE_CODES[locale] === value,
  );

const languagePrefix = (value: string) => value.toLowerCase().split("-")[0];

// Exact match first ("zh-CN"), then same base language ("zh-TW" -> "zh-CN").
export const resolveLocale = (value: string | null | undefined): Locale => {
  if (!value) return DEFAULT_LOCALE;
  const exact = SUPPORTED_LOCALES.find(
    (locale) => locale.toLowerCase() === value.toLowerCase(),
  );
  if (exact) return exact;
  const prefix = languagePrefix(value);
  return (
    SUPPORTED_LOCALES.find((locale) => languagePrefix(locale) === prefix) ??
    DEFAULT_LOCALE
  );
};

// Replaces `{name}` placeholders; unknown placeholders are left untouched.
const interpolate = (template: string, params?: TranslationParams) =>
  params
    ? template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in params ? String(params[name]) : match,
      )
    : template;

export const translate = (
  locale: Locale,
  key: TranslationKey,
  params?: TranslationParams,
): string => {
  const localized: LocaleMessages = messages[locale];
  return interpolate(localized[key] ?? en[key], params);
};

// For code outside the React tree (contexts mounted above LocaleProvider,
// plain utilities). LocaleProvider keeps the active locale in sync.
let currentLocale: Locale = DEFAULT_LOCALE;

export const setCurrentLocale = (locale: Locale) => {
  currentLocale = locale;
};

export const translateCurrent = (
  key: TranslationKey,
  params?: TranslationParams,
): string => translate(currentLocale, key, params);

export const getCurrentLocale = (): Locale => currentLocale;
