export const EXPIRY_OPTIONS = [
  { label: "Disable in 1 hour", value: "1h" },
  { label: "Disable in 1 day", value: "1d" },
  { label: "Disable in 2 days", value: "2d" },
  { label: "Disable in 7 days", value: "7d" },
  { label: "Disable in 30 days", value: "30d" },
  { label: "Never auto-disable", value: "never" },
  { label: "Disable at...", value: "custom" },
];

export const EXPIRY_OPTIONS_FOR_EDIT = EXPIRY_OPTIONS.filter(
  (option) => option.value !== "never",
);

export const DEFAULT_EDIT_EXPIRY_OPTION = "7d";

const toIsoFromDatetimeLocal = (value: string): string | undefined => {
  const trimmed = (value || "").trim();
  if (!trimmed) return undefined;
  const date = new Date(trimmed);
  if (!Number.isFinite(date.getTime())) return undefined;
  if (date.getTime() - Date.now() < 60_000) return undefined;
  return date.toISOString();
};

export const toDatetimeLocalFromIso = (value: string | null): string => {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

export const calculateExpiresAt = (
  option: string,
  customDate?: string,
): string | null | undefined => {
  if (option === "never") return null;
  if (option === "custom") return toIsoFromDatetimeLocal(customDate || "");

  const now = new Date();
  switch (option) {
    case "1h":
      now.setHours(now.getHours() + 1);
      break;
    case "1d":
      now.setDate(now.getDate() + 1);
      break;
    case "2d":
      now.setDate(now.getDate() + 2);
      break;
    case "7d":
      now.setDate(now.getDate() + 7);
      break;
    case "30d":
      now.setDate(now.getDate() + 30);
      break;
    default:
      return undefined;
  }
  return now.toISOString();
};

export const formatAutoDisableText = (expiresAt: string | null): string => {
  if (!expiresAt) return "External access does not auto-disable.";
  const ts = Date.parse(String(expiresAt));
  if (!Number.isFinite(ts)) return "External access will auto-disable.";
  return `External access auto-disables on ${new Date(ts).toLocaleString()}.`;
};
