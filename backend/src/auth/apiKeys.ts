import crypto from "crypto";
import { config } from "../config";

const API_KEY_SCRYPT_PEPPER = config.apiKeyHashPepper;
const API_KEY_SCRYPT_N = 1 << 14;
const API_KEY_SCRYPT_R = 8;
const API_KEY_SCRYPT_P = 1;
const API_KEY_SCRYPT_KEYLEN = 32;
const API_KEY_SCRYPT_MAXMEM = 32 * 1024 * 1024;

export const API_KEY_PREFIX = "exd_";
export const DEFAULT_API_KEY_SCOPES = [
  "drawings:read",
  "drawings:write",
  "collections:read",
  "collections:write",
] as const;

// Scope carried only by per-drawing agent tokens (ApiKey.drawingId set). It is
// intentionally absent from DEFAULT_API_KEY_SCOPES so account-wide keys can
// never self-assign it — it is granted exclusively by the agent-token mint
// route and confines the key to its drawing's agent routes.
export const AGENT_OPS_SCOPE = "agent:ops";
export const AGENT_TOKEN_SCOPES = [AGENT_OPS_SCOPE] as const;

export const generateApiKey = (): {
  token: string;
  keyId: string;
  prefix: string;
  tokenHash: string;
} => {
  const keyId = crypto.randomBytes(12).toString("base64url");
  const secret = crypto.randomBytes(32).toString("base64url");
  const token = `${API_KEY_PREFIX}${keyId}_${secret}`;

  return {
    token,
    keyId,
    prefix: token.slice(0, 16),
    tokenHash: hashApiKey(token),
  };
};

export const hashApiKey = (token: string): string =>
  crypto
    .scryptSync(token, API_KEY_SCRYPT_PEPPER, API_KEY_SCRYPT_KEYLEN, {
      N: API_KEY_SCRYPT_N,
      r: API_KEY_SCRYPT_R,
      p: API_KEY_SCRYPT_P,
      maxmem: API_KEY_SCRYPT_MAXMEM,
    })
    .toString("hex");

export const isApiKeyToken = (token: string): boolean => token.startsWith(API_KEY_PREFIX);

export const extractApiKeyId = (token: string): string | null => {
  if (!isApiKeyToken(token)) return null;
  const withoutPrefix = token.slice(API_KEY_PREFIX.length);
  const separatorIndex = withoutPrefix[16] === "_" ? 16 : withoutPrefix.indexOf("_");
  if (separatorIndex <= 0) return null;
  const keyId = withoutPrefix.slice(0, separatorIndex);
  return /^[A-Za-z0-9_-]{8,64}$/.test(keyId) ? keyId : null;
};

export const apiKeyHashMatches = (token: string, storedHash: string): boolean => {
  const computed = Buffer.from(hashApiKey(token), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (computed.length !== stored.length) return false;
  return crypto.timingSafeEqual(computed, stored);
};

export const serializeApiKeyScopes = (scopes: readonly string[] = DEFAULT_API_KEY_SCOPES): string =>
  scopes.join(",");

export const parseApiKeyScopes = (raw: string | null | undefined): string[] =>
  (raw || "")
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);

export const hasBearerApiKey = (authorizationHeader: unknown): boolean => {
  const header = Array.isArray(authorizationHeader)
    ? authorizationHeader[0]
    : authorizationHeader;
  if (typeof header !== "string") return false;
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" && typeof token === "string" && isApiKeyToken(token);
};

export const isNonBrowserApiKeyBearerRequest = (req: {
  headers: Record<string, unknown>;
}): boolean => {
  if (!hasBearerApiKey(req.headers.authorization)) return false;
  return !req.headers.origin && !req.headers.referer;
};
