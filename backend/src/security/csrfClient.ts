import { Request } from "express";

export const CSRF_CLIENT_COOKIE_NAME = "excalidash-csrf-client";

export const parseCookies = (
  cookieHeader: string | undefined,
): Record<string, string> => {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValueParts] = part.split("=");
    const key = rawKey?.trim();
    if (!key) continue;
    const rawValue = rawValueParts.join("=").trim();
    try {
      cookies[key] = decodeURIComponent(rawValue);
    } catch {
      cookies[key] = rawValue;
    }
  }
  return cookies;
};

export const getCsrfClientCookieValue = (req: Request): string | null => {
  const cookies = parseCookies(req.headers.cookie);
  const value = cookies[CSRF_CLIENT_COOKIE_NAME];
  if (!value) return null;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(value)) return null;
  return value;
};

export const getLegacyClientId = (req: Request): string => {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const userAgent = req.headers["user-agent"] || "unknown";
  return `${ip}:${userAgent}`.slice(0, 256);
};

export const getCsrfValidationClientIds = (req: Request): string[] => {
  const candidates: string[] = [];
  const cookieValue = getCsrfClientCookieValue(req);
  if (cookieValue) {
    candidates.push(`cookie:${cookieValue}`);
  }
  const legacyClientId = getLegacyClientId(req);
  if (!candidates.includes(legacyClientId)) {
    candidates.push(legacyClientId);
  }
  return candidates;
};
