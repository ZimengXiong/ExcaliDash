/**
 * Configuration validation and environment variable management
 */
import dotenv from "dotenv";
import crypto from "crypto";
import path from "path";
import {
  type PasswordPolicyConfig,
  buildPasswordPolicyMessage,
  resolvePasswordPolicyConfig,
  validatePasswordAgainstPolicy,
} from "./config/passwordPolicy";
import { validateProductionConfig } from "./config/production";
import {
  readBoolean,
  readCsv,
  readNumber,
  readOptionalString,
  readRaw,
  readString,
} from "./config/env";
import {
  type LinkShareConfig,
  type UpdateCheckConfig,
  parseDrawingsCacheTtlMs,
  parseTrustProxy,
  resolveLinkShareConfig,
  resolveUpdateCheckConfig,
} from "./config/derived";

export { buildPasswordPolicyMessage, validatePasswordAgainstPolicy };

dotenv.config();

interface S3Config {
  bucket: string | null;
  region: string;
  endpoint: string | null;
  publicUrl: string | null;
  forcePathStyle: boolean;
  keyPrefix: string;
  accessKeyId: string | null;
  secretAccessKey: string | null;
}

interface BackupConfig {
  schedule: string | null;
  dir: string;
  retentionDays: number;
}

interface Config {
  port: number;
  nodeEnv: string;
  isDev: boolean;
  isProduction: boolean;
  databaseUrl?: string;
  frontendUrl?: string;
  trustProxy: boolean | number;
  drawingsCacheTtlMs: number;
  authMode: AuthMode;
  jwtSecret: string;
  jwtAccessExpiresIn: string;
  jwtRefreshExpiresIn: string;
  rateLimitMaxRequests: number;
  rateLimitWindowMs: number;
  csrfMaxRequests: number;
  csrfRateLimitWindowMs: number;
  snapshotRetentionMs: number;
  uploadMaxBytes: number;
  bodyLimitMb: number;
  csrfSecret: string | null;
  debugCsrf: boolean;
  apiKeyHashPepper: string;
  oidc: OidcConfig;
  enablePasswordReset: boolean;
  enableRefreshTokenRotation: boolean;
  enableAuditLogging: boolean;
  enforceHttpsRedirect: boolean;
  disableOnboardingGate: boolean;
  bootstrapSetupCodeTtlMs: number;
  bootstrapSetupCodeMaxAttempts: number;
  passwordPolicy: PasswordPolicyConfig;
  backups: BackupConfig;
  s3: S3Config;
  linkShare: LinkShareConfig;
  updateCheck: UpdateCheckConfig;
}

export type AuthMode = "local" | "hybrid" | "oidc_enforced" | "disabled";
// True only for env-enforced (OIDC-backed) modes; `local` uses the runtime toggle, `disabled` turns auth off.
export const authModeEnablesAuth = (mode: AuthMode): boolean => mode === "hybrid" || mode === "oidc_enforced";

interface OidcConfig {
  enabled: boolean;
  enforced: boolean;
  providerName: string;
  issuerUrl: string | null;
  discoveryUrl: string | null;
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string | null;
  idTokenSignedResponseAlg: string | null;
  tokenEndpointAuthMethod:
    | "none"
    | "client_secret_basic"
    | "client_secret_post"
    | null;
  scopes: string;
  emailClaim: string;
  emailVerifiedClaim: string;
  groupsClaim: string;
  adminGroups: string[];
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

const getOptionalOidcSigningAlg = (key: string): string | null => {
  const raw = readRaw(key);
  if (!raw) return null;
  const normalized = raw.trim();

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

const getOptionalOidcTokenEndpointAuthMethod = (
  key: string,
): "none" | "client_secret_basic" | "client_secret_post" | null => {
  const raw = readRaw(key);
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized.length === 0) return null;
  if (
    normalized === "none" ||
    normalized === "client_secret_basic" ||
    normalized === "client_secret_post"
  ) {
    return normalized;
  }
  throw new Error(
    `${key} must be one of: none, client_secret_basic, client_secret_post`,
  );
};

const resolveJwtSecret = (nodeEnv: string): string => {
  const provided = readRaw("JWT_SECRET");
  if (provided && provided.trim().length > 0) {
    return provided;
  }

  if (nodeEnv === "production") {
    throw new Error("Missing required environment variable: JWT_SECRET");
  }

  const generated = crypto.randomBytes(32).toString("hex");
  console.warn(
    "[security] JWT_SECRET is not set (non-production). Using an ephemeral secret; tokens will be invalidated on restart.",
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
    : path.resolve(
        hasLeadingPrismaDir ? backendRoot : prismaDir,
        normalizedRelative,
      );

  return `file:${absolutePath}`;
};

process.env.DATABASE_URL = resolveDatabaseUrl(process.env.DATABASE_URL);

const parseAuthMode = (rawValue: string | undefined): AuthMode => {
  const normalized = (rawValue || "local").trim().toLowerCase();
  if (
    normalized === "local" ||
    normalized === "hybrid" ||
    normalized === "oidc_enforced" ||
    normalized === "disabled"
  ) {
    return normalized;
  }
  throw new Error(
    "Invalid AUTH_MODE. Expected one of: local, hybrid, oidc_enforced, disabled",
  );
};

const resolveOidcConfig = (authMode: AuthMode): OidcConfig => {
  const issuerUrl = readOptionalString("OIDC_ISSUER_URL");
  const discoveryUrl = readOptionalString("OIDC_DISCOVERY_URL");
  const clientId = readOptionalString("OIDC_CLIENT_ID");
  const clientSecret = readOptionalString("OIDC_CLIENT_SECRET");
  const redirectUri = readOptionalString("OIDC_REDIRECT_URI");
  const groupsClaim = readString("OIDC_GROUPS_CLAIM", "groups").trim();
  const adminGroups = readCsv("OIDC_ADMIN_GROUPS");
  const requiredWhenEnabled = {
    OIDC_ISSUER_URL: issuerUrl,
    OIDC_CLIENT_ID: clientId,
    OIDC_REDIRECT_URI: redirectUri,
  };

  if (groupsClaim.length === 0) {
    throw new Error(
      "Invalid OIDC_GROUPS_CLAIM: must be a non-empty claim key/path",
    );
  }

  const enabled = authModeEnablesAuth(authMode);
  const missingRequired = Object.entries(requiredWhenEnabled)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (enabled && missingRequired.length > 0) {
    throw new Error(
      `AUTH_MODE=${authMode} requires OIDC configuration. Missing: ${missingRequired.join(", ")}`,
    );
  }

  if (!enabled) {
    const hasOidcVars =
      Object.values(requiredWhenEnabled).some((value) => Boolean(value)) ||
      adminGroups.length > 0;
    if (hasOidcVars) {
      console.warn(
        `[config] AUTH_MODE=${authMode}; ignoring OIDC_* provider settings.`,
      );
    }
  }

  const idTokenSignedResponseAlg = enabled
    ? getOptionalOidcSigningAlg("OIDC_ID_TOKEN_SIGNED_RESPONSE_ALG")
    : null;
  const tokenEndpointAuthMethod = enabled
    ? getOptionalOidcTokenEndpointAuthMethod("OIDC_TOKEN_ENDPOINT_AUTH_METHOD")
    : null;
  if (enabled && idTokenSignedResponseAlg && /^HS/i.test(idTokenSignedResponseAlg) && !clientSecret) {
    throw new Error(
      "OIDC_ID_TOKEN_SIGNED_RESPONSE_ALG using HS* requires OIDC_CLIENT_SECRET for a confidential client"
    );
  }

  return {
    enabled,
    enforced: authMode === "oidc_enforced",
    providerName: readString("OIDC_PROVIDER_NAME", "OIDC"),
    issuerUrl,
    discoveryUrl,
    clientId,
    clientSecret,
    redirectUri,
    idTokenSignedResponseAlg,
    tokenEndpointAuthMethod,
    scopes: readString("OIDC_SCOPES", "openid profile email"),
    emailClaim: readString("OIDC_EMAIL_CLAIM", "email"),
    emailVerifiedClaim: readString(
      "OIDC_EMAIL_VERIFIED_CLAIM",
      "email_verified",
    ),
    groupsClaim,
    adminGroups,
    requireEmailVerified: readBoolean(
      "OIDC_REQUIRE_EMAIL_VERIFIED",
      true,
    ),
    jitProvisioning: readBoolean("OIDC_JIT_PROVISIONING", true),
    firstUserAdmin: readBoolean("OIDC_FIRST_USER_ADMIN", true),
  };
};


const resolveBackupConfig = (): BackupConfig => {
  const backupDir = readOptionalString("BACKUP_DIR") || path.resolve(__dirname, "../backups");
  return {
    schedule: readOptionalString("BACKUP_SCHEDULE"),
    dir: backupDir,
    retentionDays: readNumber("BACKUP_RETENTION_DAYS", 14),
  };
};

const resolvedAuthMode = parseAuthMode(readRaw("AUTH_MODE"));
const resolvedNodeEnv = readString("NODE_ENV", "development");

const resolveS3Config = (): S3Config => ({
  bucket: readOptionalString("S3_BUCKET"),
  region: readString("S3_REGION", "us-east-1"),
  endpoint: readOptionalString("S3_ENDPOINT"),
  publicUrl: readOptionalString("S3_PUBLIC_URL"),
  forcePathStyle: readString("S3_FORCE_PATH_STYLE", "false").toLowerCase() === "true",
  keyPrefix: readRaw("S3_KEY_PREFIX")?.replace(/\/+$/, "") || "excalidash",
  accessKeyId: readOptionalString("AWS_ACCESS_KEY_ID"),
  secretAccessKey: readOptionalString("AWS_SECRET_ACCESS_KEY"),
});

export const config: Config = {
  port: readNumber("PORT", 8000),
  nodeEnv: resolvedNodeEnv,
  isDev: resolvedNodeEnv === "development",
  isProduction: resolvedNodeEnv === "production",
  databaseUrl: process.env.DATABASE_URL,
  frontendUrl: parseFrontendUrl(readRaw("FRONTEND_URL")),
  trustProxy: parseTrustProxy(),
  drawingsCacheTtlMs: parseDrawingsCacheTtlMs(),
  authMode: resolvedAuthMode,
  jwtSecret: resolveJwtSecret(resolvedNodeEnv),
  jwtAccessExpiresIn: readString("JWT_ACCESS_EXPIRES_IN", "15m"),
  jwtRefreshExpiresIn: readString("JWT_REFRESH_EXPIRES_IN", "7d"),
  rateLimitMaxRequests: readNumber("RATE_LIMIT_MAX_REQUESTS", 1000),
  rateLimitWindowMs: readNumber("RATE_LIMIT_WINDOW_MS", 900000),
  csrfMaxRequests: readNumber("CSRF_MAX_REQUESTS", 60),
  csrfRateLimitWindowMs: readNumber("CSRF_RATE_LIMIT_WINDOW_MS", 60000),
  snapshotRetentionMs: readNumber("SNAPSHOT_RETENTION_DAYS", 2) * 24 * 60 * 60 * 1000,
  uploadMaxBytes: readNumber("UPLOAD_MAX_MB", 100) * 1024 * 1024,
  bodyLimitMb: readNumber("BODY_LIMIT_MB", 50),
  csrfSecret: readRaw("CSRF_SECRET") || null,
  debugCsrf: readRaw("DEBUG_CSRF") === "true",
  apiKeyHashPepper: readRaw("API_KEY_HASH_PEPPER") || "api-key-hash-pepper",
  oidc: resolveOidcConfig(resolvedAuthMode),
  enablePasswordReset: readBoolean("ENABLE_PASSWORD_RESET", false),
  enableRefreshTokenRotation: readBoolean(
    "ENABLE_REFRESH_TOKEN_ROTATION",
    true,
  ),
  enableAuditLogging: readBoolean("ENABLE_AUDIT_LOGGING", false),
  enforceHttpsRedirect: readBoolean("ENFORCE_HTTPS_REDIRECT", true),
  disableOnboardingGate: readRaw("DISABLE_ONBOARDING_GATE") === "true",
  bootstrapSetupCodeTtlMs: readNumber(
    "BOOTSTRAP_SETUP_CODE_TTL_MS",
    15 * 60 * 1000,
  ),
  bootstrapSetupCodeMaxAttempts: readNumber(
    "BOOTSTRAP_SETUP_CODE_MAX_ATTEMPTS",
    10,
  ),
  passwordPolicy: resolvePasswordPolicyConfig(),
  backups: resolveBackupConfig(),
  s3: resolveS3Config(),
  linkShare: resolveLinkShareConfig(),
  updateCheck: resolveUpdateCheckConfig(),
};

if (config.nodeEnv === "production") {
  validateProductionConfig(config);
}

console.log("Configuration validated successfully");
