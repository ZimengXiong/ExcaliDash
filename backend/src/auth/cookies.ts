import type { Request, Response } from "express";
import ms, { type StringValue } from "ms";
import { config } from "../config";

export const ACCESS_TOKEN_COOKIE_NAME = "excalidash-access-token";
export const REFRESH_TOKEN_COOKIE_NAME = "excalidash-refresh-token";

const DEFAULT_ACCESS_TTL_MS = 15 * 60 * 1000;
const DEFAULT_REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_REMEMBERED_REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const parseDurationToMs = (value: string, fallbackMs: number): number => {
  const parsed = ms(value as StringValue);
  if (typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallbackMs;
};

const ACCESS_TOKEN_COOKIE_MAX_AGE_MS = parseDurationToMs(
  config.jwtAccessExpiresIn,
  DEFAULT_ACCESS_TTL_MS
);
const REFRESH_TOKEN_COOKIE_MAX_AGE_MS = parseDurationToMs(
  config.jwtRefreshExpiresIn,
  DEFAULT_REFRESH_TTL_MS
);
const REMEMBERED_REFRESH_TOKEN_COOKIE_MAX_AGE_MS = parseDurationToMs(
  config.jwtRefreshExpiresInRemembered,
  DEFAULT_REMEMBERED_REFRESH_TTL_MS
);

/** The refresh cookie outlives the session only when the user asked for it. */
export const getRefreshCookieMaxAgeMs = (remember?: boolean): number =>
  remember
    ? REMEMBERED_REFRESH_TOKEN_COOKIE_MAX_AGE_MS
    : REFRESH_TOKEN_COOKIE_MAX_AGE_MS;

const canTrustProxyHeaders = (req: Request): boolean => {
  const trustProxy = req.app?.get?.("trust proxy");
  if (trustProxy === true) return true;
  if (typeof trustProxy === "number") return trustProxy > 0;
  if (typeof trustProxy === "function") return true;
  return false;
};

const requestUsesHttps = (req: Request): boolean => {
  if (req.secure) return true;
  if (!canTrustProxyHeaders(req)) return false;
  const forwardedProto = req.headers["x-forwarded-proto"];
  const raw = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const firstHop = String(raw || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return firstHop === "https";
};

const shouldUseSecureCookies = (req: Request): boolean => requestUsesHttps(req);

const baseCookieOptions = (req: Request) => ({
  httpOnly: true,
  secure: shouldUseSecureCookies(req),
  sameSite: "lax" as const,
  path: "/",
});

export const setAuthCookies = (
  req: Request,
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
  options?: { remember?: boolean }
): void => {
  res.cookie(ACCESS_TOKEN_COOKIE_NAME, tokens.accessToken, {
    ...baseCookieOptions(req),
    maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE_MS,
  });
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, tokens.refreshToken, {
    ...baseCookieOptions(req),
    maxAge: getRefreshCookieMaxAgeMs(options?.remember),
  });
};

export const setAccessTokenCookie = (
  req: Request,
  res: Response,
  accessToken: string
): void => {
  res.cookie(ACCESS_TOKEN_COOKIE_NAME, accessToken, {
    ...baseCookieOptions(req),
    maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE_MS,
  });
};

export const clearAuthCookies = (req: Request, res: Response): void => {
  const options = baseCookieOptions(req);
  res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, options);
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, options);
};

export const parseCookieHeader = (
  cookieHeader: string | undefined
): Record<string, string> => {
  if (!cookieHeader) return {};

  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValueParts] = part.split("=");
    if (!rawKey || rawValueParts.length === 0) continue;
    const key = rawKey.trim();
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

export const readCookie = (req: Request, cookieName: string): string | null => {
  const cookies = parseCookieHeader(req.headers.cookie);
  const value = cookies[cookieName];
  if (!value || value.trim().length === 0) return null;
  return value;
};
