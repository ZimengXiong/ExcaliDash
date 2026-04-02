/**
 * Configuration validation and environment variable management
 */
import dotenv from "dotenv";
import crypto from "crypto";
import path from "path";

dotenv.config();

interface Config {
  port: number;
  nodeEnv: string;
  databaseUrl?: string;
  frontendUrl?: string;
  authMode: AuthMode;
  jwtSecret: string;
  jwtAccessExpiresIn: string;
  jwtRefreshExpiresIn: string;
  rateLimitMaxRequests: number;
  csrfMaxRequests: number;
  csrfSecret: string | null;
  oidc: OidcConfig;
  enablePasswordReset: boolean;
  enableRefreshTokenRotation: boolean;
  enableAuditLogging: boolean;
  bootstrapSetupCodeTtlMs: number;
  bootstrapSetupCodeMaxAttempts: number;
}

export type AuthMode = "local" | "hybrid" | "oidc_enforced";

interface OidcConfig {
  enabled: boolean;
  enforced: boolean;
  providerName: string;
  issuerUrl: string | null;
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string | null;
  idTokenSignedResponseAlg: string;
  scopes: string;
  emailClaim: string;
  emailVerifiedClaim: string;
  requireEmailVerified: boolean;
  jitProvisioning: boolean;
  firstUserAdmin: boolean;
}

const ALLOWED_OIDC_ID_TOKEN_ALGS = new Set([
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "ES256",
  "ES384",
  "ES512",
  "EdDSA",
  "HS256",
  "HS384",
  "HS512",
]);

const getOptionalEnv = (key: string, defaultValue: string): string => {
  return process.env[key] || defaultValue;
};

const getOptionalTrimmedEnv = (key: string): string | null => {
  const raw = process.env[key];
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getOptionalOidcSigningAlg = (key: string, defaultValue: string): string => {
  const raw = process.env[key];
  const normalized = (raw || defaultValue).trim();

  if (normalized.length === 0 || normalized.toLowerCase() === "none") {
    throw new Error(`${key} must not be empty or 'none'`);
  }
  if (!ALLOWED_OIDC_ID_TOKEN_ALGS.has(normalized)) {
    throw new Error(
      `${key} must be one of: ${Array.from(ALLOWED_OIDC_ID_TOKEN_ALGS).join(", ")}`
    );
  }

  return normalized;
};

const resolveJwtSecret = (nodeEnv: string): string => {
  const provided = process.env.JWT_SECRET;
  if (provided && provided.trim().length > 0) {
    return provided;
  }

  if (nodeEnv === "production") {
    throw new Error("Missing required environment variable: JWT_SECRET");
  }

  const generated = crypto.randomBytes(32).toString("hex");
  console.warn(
    "[security] JWT_SECRET is not set (non-production). Using an ephemeral secret; tokens will be invalidated on restart."
  );
  return generated;
};

const parseFrontendUrl = (raw: string | undefined): string | undefined => {
  if (!raw || raw.trim().length === 0) return undefined;
  const normalized = raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .join(",");
  return normalized.length > 0 ? normalized : undefined;
};

const resolveDatabaseUrl = (rawUrl?: string) => {
  const backendRoot = path.resolve(__dirname, "../");
  const defaultDbPath = path.resolve(backendRoot, "prisma/dev.db");

  if (!rawUrl || rawUrl.trim().length === 0) {
    return `file:${defaultDbPath}`;
  }

  if (!rawUrl.startsWith("file:")) {
    return rawUrl;
  }

  const filePath = rawUrl.replace(/^file:/, "");
  const prismaDir = path.resolve(backendRoot, "prisma");
  const normalizedRelative = filePath.replace(/^\.\/?/, "");
  const hasLeadingPrismaDir =
    normalizedRelative === "prisma" || normalizedRelative.startsWith("prisma/");

  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(hasLeadingPrismaDir ? backendRoot : prismaDir, normalizedRelative);

  return `file:${absolutePath}`;
};

process.env.DATABASE_URL = resolveDatabaseUrl(process.env.DATABASE_URL);

const getOptionalBoolean = (key: string, defaultValue: boolean): boolean => {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
};

const getRequiredEnvNumber = (key: string, defaultValue: number): number => {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid value for environment variable ${key}: must be a positive number`);
  }
  return parsed;
};

const parseAuthMode = (rawValue: string | undefined): AuthMode => {
  const normalized = (rawValue || "local").trim().toLowerCase();
  if (normalized === "local" || normalized === "hybrid" || normalized === "oidc_enforced") {
    return normalized;
  }
  throw new Error(
    "Invalid AUTH_MODE. Expected one of: local, hybrid, oidc_enforced"
  );
};

const resolveOidcConfig = (authMode: AuthMode): OidcConfig => {
  const issuerUrl = getOptionalTrimmedEnv("OIDC_ISSUER_URL");
  const clientId = getOptionalTrimmedEnv("OIDC_CLIENT_ID");
  const clientSecret = getOptionalTrimmedEnv("OIDC_CLIENT_SECRET");
  const redirectUri = getOptionalTrimmedEnv("OIDC_REDIRECT_URI");
  const requiredWhenEnabled = {
    OIDC_ISSUER_URL: issuerUrl,
    OIDC_CLIENT_ID: clientId,
    OIDC_REDIRECT_URI: redirectUri,
  };

  const enabled = authMode !== "local";
  const missingRequired = Object.entries(requiredWhenEnabled)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (enabled && missingRequired.length > 0) {
    throw new Error(
      `AUTH_MODE=${authMode} requires OIDC configuration. Missing: ${missingRequired.join(", ")}`
    );
  }

  if (!enabled) {
    const hasOidcVars = Object.values(requiredWhenEnabled).some((value) => Boolean(value));
    if (hasOidcVars) {
      console.warn("[config] AUTH_MODE=local; ignoring OIDC_* provider settings.");
    }
  }

  const idTokenSignedResponseAlg = enabled
    ? getOptionalOidcSigningAlg("OIDC_ID_TOKEN_SIGNED_RESPONSE_ALG", "RS256")
    : "RS256";
  if (enabled && /^HS/i.test(idTokenSignedResponseAlg) && !clientSecret) {
    throw new Error(
      "OIDC_ID_TOKEN_SIGNED_RESPONSE_ALG using HS* requires OIDC_CLIENT_SECRET for a confidential client"
    );
  }

  return {
    enabled,
    enforced: authMode === "oidc_enforced",
    providerName: getOptionalEnv("OIDC_PROVIDER_NAME", "OIDC"),
    issuerUrl,
    clientId,
    clientSecret,
    redirectUri,
    idTokenSignedResponseAlg,
    scopes: getOptionalEnv("OIDC_SCOPES", "openid profile email"),
    emailClaim: getOptionalEnv("OIDC_EMAIL_CLAIM", "email"),
    emailVerifiedClaim: getOptionalEnv("OIDC_EMAIL_VERIFIED_CLAIM", "email_verified"),
    requireEmailVerified: getOptionalBoolean("OIDC_REQUIRE_EMAIL_VERIFIED", true),
    jitProvisioning: getOptionalBoolean("OIDC_JIT_PROVISIONING", true),
    firstUserAdmin: getOptionalBoolean("OIDC_FIRST_USER_ADMIN", true),
  };
};

const resolvedAuthMode = parseAuthMode(process.env.AUTH_MODE);

export const config: Config = {
  port: getRequiredEnvNumber("PORT", 8000),
  nodeEnv: getOptionalEnv("NODE_ENV", "development"),
  databaseUrl: process.env.DATABASE_URL,
  frontendUrl: parseFrontendUrl(process.env.FRONTEND_URL),
  authMode: resolvedAuthMode,
  jwtSecret: resolveJwtSecret(getOptionalEnv("NODE_ENV", "development")),
  jwtAccessExpiresIn: getOptionalEnv("JWT_ACCESS_EXPIRES_IN", "15m"),
  jwtRefreshExpiresIn: getOptionalEnv("JWT_REFRESH_EXPIRES_IN", "7d"),
  rateLimitMaxRequests: getRequiredEnvNumber("RATE_LIMIT_MAX_REQUESTS", 1000),
  csrfMaxRequests: getRequiredEnvNumber("CSRF_MAX_REQUESTS", 60),
  csrfSecret: process.env.CSRF_SECRET || null,
  oidc: resolveOidcConfig(resolvedAuthMode),
  enablePasswordReset: getOptionalBoolean("ENABLE_PASSWORD_RESET", false),
  enableRefreshTokenRotation: getOptionalBoolean("ENABLE_REFRESH_TOKEN_ROTATION", true),
  enableAuditLogging: getOptionalBoolean("ENABLE_AUDIT_LOGGING", false),
  bootstrapSetupCodeTtlMs: getRequiredEnvNumber("BOOTSTRAP_SETUP_CODE_TTL_MS", 15 * 60 * 1000),
  bootstrapSetupCodeMaxAttempts: getRequiredEnvNumber("BOOTSTRAP_SETUP_CODE_MAX_ATTEMPTS", 10),
};

if (config.nodeEnv === "production") {
  const normalizedSecret = config.jwtSecret.trim();
  const insecureJwtSecretPlaceholders = new Set([
    "your-secret-key-change-in-production",
    "change-this-secret-in-production-min-32-chars",
  ]);

  if (config.jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters long in production");
  }
  if (
    insecureJwtSecretPlaceholders.has(normalizedSecret)
  ) {
    throw new Error("JWT_SECRET must be changed from placeholder/default value in production");
  }
  if (config.oidc.enabled && config.oidc.redirectUri && !/^https:\/\//i.test(config.oidc.redirectUri)) {
    throw new Error("OIDC_REDIRECT_URI must be HTTPS in production");
  }
}

console.log("Configuration validated successfully");
