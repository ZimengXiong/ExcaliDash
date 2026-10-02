import crypto from "crypto";
import { Request } from "express";

export const OIDC_FLOW_COOKIE_NAME = "excalidash-oidc-flow";
export const OIDC_PROVIDER_KEY = "oidc";
export const OIDC_FLOW_TTL_MS = 10 * 60 * 1000;

export type OidcFlowPayload = {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  expiresAt: number;
};

export const requestUsesHttps = (req: Request): boolean => {
  if (req.secure) return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  const raw = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto;
  const firstHop = String(raw || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return firstHop === "https";
};

export const normalizeEmail = (value: string): string =>
  value.trim().toLowerCase();

export const resolveIdTokenSignedResponseAlg = (
  configuredAlg: string | null,
  hasClientSecret: boolean,
  issuerMetadata: { id_token_signing_alg_values_supported?: unknown },
): string => {
  if (configuredAlg) return configuredAlg;
  const advertised = issuerMetadata.id_token_signing_alg_values_supported;
  if (Array.isArray(advertised)) {
    const supported = advertised
      .filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      )
      .map((value) => value.trim());
    if (supported.length > 0) {
      const preferred = [
        "RS256",
        "PS256",
        "ES256",
        "EdDSA",
        "RS384",
        "PS384",
        "ES384",
        "RS512",
        "PS512",
        "ES512",
      ];
      for (const candidate of preferred) {
        if (supported.includes(candidate)) {
          return candidate;
        }
      }
      const firstAsymmetric = supported.find(
        (alg) => !/^HS/i.test(alg) && alg.toLowerCase() !== "none",
      );
      if (firstAsymmetric) return firstAsymmetric;
      const hsSupported = supported.filter((alg) => /^HS/i.test(alg));
      if (hsSupported.length > 0) {
        if (!hasClientSecret) {
          throw new Error(
            "OIDC provider only advertises HS* ID token signing algorithms, but OIDC_CLIENT_SECRET is not configured. " +
              "Fix: set OIDC_CLIENT_SECRET for a confidential client, or configure your provider/client to sign ID tokens with an asymmetric algorithm (for example RS256).",
          );
        }
        const preferredHs = ["HS256", "HS384", "HS512"];
        for (const candidate of preferredHs) {
          if (hsSupported.includes(candidate)) return candidate;
        }
        return hsSupported[0] as string;
      }
    }
  }
  return "RS256";
};

export const parseJwtAlgMismatchError = (
  error: unknown,
): { expected: string; got: string } | null => {
  if (!(error instanceof Error)) return null;
  const match = error.message.match(
    /expected\s+([A-Za-z0-9_-]+)\s*,\s*got:\s*([A-Za-z0-9_-]+)/i,
  );
  if (!match) return null;
  return {
    expected: String(match[1]).toUpperCase(),
    got: String(match[2]).toUpperCase(),
  };
};

export const canUseIdTokenSigningAlg = (
  alg: string,
  hasClientSecret: boolean,
): boolean => {
  if (alg.toLowerCase() === "none") return false;
  if (/^HS/i.test(alg)) return hasClientSecret;
  return true;
};

export const sanitizeReturnTo = (rawValue: unknown): string => {
  if (typeof rawValue !== "string") return "/";
  const value = rawValue.trim();
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  if (/[\r\n]/.test(value)) return "/";
  if (value.length > 2048) return "/";
  return value;
};

const base64UrlEncode = (value: Buffer | string): string => {
  const buffer = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const base64UrlDecode = (value: string): Buffer => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
};

const signFlowPayload = (encodedPayload: string, secret: string): string =>
  base64UrlEncode(
    crypto.createHmac("sha256", secret).update(encodedPayload, "utf8").digest(),
  );

export const encodeFlowPayload = (
  payload: OidcFlowPayload,
  secret: string,
): string => {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signFlowPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
};

export const decodeFlowPayload = (
  cookieValue: string | null,
  secret: string,
): OidcFlowPayload | null => {
  if (!cookieValue) return null;
  const [encodedPayload, providedSignature] = cookieValue.split(".");
  if (!encodedPayload || !providedSignature) return null;
  try {
    const expectedSignature = signFlowPayload(encodedPayload, secret);
    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    const providedBuffer = Buffer.from(providedSignature, "utf8");
    if (expectedBuffer.length !== providedBuffer.length) return null;
    if (!crypto.timingSafeEqual(expectedBuffer, providedBuffer)) return null;
    const parsed = JSON.parse(
      base64UrlDecode(encodedPayload).toString("utf8"),
    ) as Partial<OidcFlowPayload>;
    if (
      typeof parsed.state !== "string" ||
      typeof parsed.nonce !== "string" ||
      typeof parsed.codeVerifier !== "string" ||
      typeof parsed.returnTo !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }
    if (Date.now() > parsed.expiresAt) return null;
    return {
      state: parsed.state,
      nonce: parsed.nonce,
      codeVerifier: parsed.codeVerifier,
      returnTo: sanitizeReturnTo(parsed.returnTo),
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
};

export const readStringClaim = (
  claims: Record<string, unknown>,
  key: string,
): string | null => {
  const value = claims[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const readBooleanClaim = (
  claims: Record<string, unknown>,
  key: string,
): boolean | null => {
  const value = claims[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return null;
};

export const readClaimByPath = (
  claims: Record<string, unknown>,
  keyPath: string,
): unknown => {
  const segments = keyPath
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) return undefined;
  let current: unknown = claims;
  for (const segment of segments) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
};

export const normalizeClaimGroups = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [];
};

export const canonicalizeIssuerUrl = (issuer: string): string => {
  const trimmed = issuer.trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = new URL(trimmed);
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
};

export const getOidcErrorMessage = (errorCode: string): string => {
  switch (errorCode) {
    case "missing_flow":
      return "Missing or expired OIDC login flow. Please try again.";
    case "provider_error":
      return "OIDC provider returned an error.";
    case "missing_subject":
      return "OIDC response is missing required subject claim.";
    case "missing_email":
      return "OIDC response is missing required email claim.";
    case "unverified_email":
      return "OIDC account email is not verified.";
    case "account_inactive":
      return "Your account is inactive.";
    case "provisioning_disabled":
      return "No account found. Ask an admin to create your account or enable OIDC auto-provisioning.";
    case "callback_failed":
      return "OIDC callback validation failed.";
    default:
      return "OIDC sign-in failed.";
  }
};
