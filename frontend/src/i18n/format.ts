import { formatDistanceToNow, type Locale as DateFnsLocale } from "date-fns";
import { enUS, fr, zhCN } from "date-fns/locale";
import type { Locale } from "./index";

const dateFnsLocales: Record<Locale, DateFnsLocale> = {
  en: enUS,
  fr,
  "zh-CN": zhCN,
};

type DateInput = Date | string | number;

export const formatDateTime = (
  value: DateInput,
  locale: Locale,
  options?: Intl.DateTimeFormatOptions,
): string => new Date(value).toLocaleString(locale, options);

// "3 hours ago" / "3 小时前"
export const formatRelativeTime = (value: DateInput, locale: Locale): string =>
  formatDistanceToNow(value, {
    addSuffix: true,
    locale: dateFnsLocales[locale],
  });

// "a, b, and c" / "a、b和c"
export const formatList = (items: string[], locale: Locale): string =>
  new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(
    items,
  );

// Compact form for tight badges: "5 min ago" / "il y a 5 min".
// Returns null under a minute so callers can show their own "just now".
export const formatTimeAgoShort = (
  value: DateInput,
  locale: Locale,
): string | null => {
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return null;
  const format = new Intl.RelativeTimeFormat(locale, { style: "narrow" });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return format.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return format.format(-hours, "hour");
  return format.format(-Math.floor(hours / 24), "day");
};
