import crypto from "crypto";
import { PrismaClient } from "../generated/client";
import { BOOTSTRAP_USER_ID, DEFAULT_SYSTEM_CONFIG_ID } from "./authMode";
import { logger } from "../logger";

const BOOTSTRAP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const randomCodeChars = (length: number): string => {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    const index = crypto.randomInt(0, BOOTSTRAP_CODE_ALPHABET.length);
    out += BOOTSTRAP_CODE_ALPHABET[index];
  }
  return out;
};

export const normalizeBootstrapSetupCode = (value: string): string =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();

export const hashBootstrapSetupCode = (normalizedCode: string): string =>
  crypto.createHash("sha256").update(normalizedCode, "utf8").digest("hex");

const timingSafeHexCompare = (expectedHex: string, actualHex: string): boolean => {
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(actualHex, "hex");
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
};

const generateBootstrapSetupCode = (): string => {
  const raw = randomCodeChars(8);
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
};

const getBootstrapState = async (
  prisma: PrismaClient,
  options: { authMode: "local" | "hybrid" | "oidc_enforced" }
) => {
  const [systemConfig, bootstrapUser, activeUsers] = await Promise.all([
    prisma.systemConfig.upsert({
      where: { id: DEFAULT_SYSTEM_CONFIG_ID },
      update: {},
      create: {
        id: DEFAULT_SYSTEM_CONFIG_ID,
        authEnabled: options.authMode !== "local",
      },
      select: {
        authEnabled: true,
        bootstrapSetupCodeHash: true,
        bootstrapSetupCodeExpiresAt: true,
        bootstrapSetupCodeFailedAttempts: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: BOOTSTRAP_USER_ID },
      select: { id: true, isActive: true },
    }),
    prisma.user.count({ where: { isActive: true } }),
  ]);

  return { systemConfig, bootstrapUser, activeUsers };
};

export const shouldRequireBootstrapSetupCode = async (
  prisma: PrismaClient,
  options: { authMode: "local" | "hybrid" | "oidc_enforced" }
): Promise<boolean> => {
  if (options.authMode === "oidc_enforced") return false;

  const { systemConfig, bootstrapUser, activeUsers } = await getBootstrapState(prisma, {
    authMode: options.authMode,
  });
  return (
    Boolean(systemConfig.authEnabled) &&
    Boolean(bootstrapUser) &&
    bootstrapUser?.isActive === false &&
    activeUsers === 0
  );
};

type IssueBootstrapSetupCodeParams = {
  prisma: PrismaClient;
  ttlMs: number;
  authMode: "local" | "hybrid" | "oidc_enforced";
  reason:
    | "startup"
    | "onboarding_enabled"
    | "auth_enabled_toggle"
    | "bootstrap_register_reissue";
};

export const issueBootstrapSetupCodeIfRequired = async (
  params: IssueBootstrapSetupCodeParams
): Promise<{ issued: boolean; code?: string; expiresAt?: Date }> => {
  const { prisma, ttlMs, authMode, reason } = params;
  if (authMode === "oidc_enforced") {
    return { issued: false };
  }

  const required = await shouldRequireBootstrapSetupCode(prisma, { authMode });
  if (!required) {
    return { issued: false };
  }

  const code = generateBootstrapSetupCode();
  const normalized = normalizeBootstrapSetupCode(code);
  const codeHash = hashBootstrapSetupCode(normalized);
  const expiresAt = new Date(Date.now() + ttlMs);

  await prisma.systemConfig.update({
    where: { id: DEFAULT_SYSTEM_CONFIG_ID },
    data: {
      bootstrapSetupCodeHash: codeHash,
      bootstrapSetupCodeIssuedAt: new Date(),
      bootstrapSetupCodeExpiresAt: expiresAt,
      bootstrapSetupCodeFailedAttempts: 0,
    },
  });

  logger.info(
    { reason, code, expiresAt: expiresAt.toISOString() },
    "Bootstrap setup code issued"
  );

  return { issued: true, code, expiresAt };
};

type VerifyBootstrapSetupCodeParams = {
  prisma: PrismaClient;
  providedCode: string | undefined;
  maxAttempts: number;
};

export const verifyBootstrapSetupCode = async (
  params: VerifyBootstrapSetupCodeParams
): Promise<
  | { ok: true }
  | { ok: false; reason: "missing" | "unavailable" | "expired" | "invalid" | "locked" }
> => {
  const { prisma, providedCode, maxAttempts } = params;
  const systemConfig = await prisma.systemConfig.findUnique({
    where: { id: DEFAULT_SYSTEM_CONFIG_ID },
    select: {
      bootstrapSetupCodeHash: true,
      bootstrapSetupCodeExpiresAt: true,
      bootstrapSetupCodeFailedAttempts: true,
    },
  });

  if (!systemConfig?.bootstrapSetupCodeHash || !systemConfig.bootstrapSetupCodeExpiresAt) {
    return { ok: false, reason: "unavailable" };
  }

  if (new Date() > systemConfig.bootstrapSetupCodeExpiresAt) {
    return { ok: false, reason: "expired" };
  }

  if (systemConfig.bootstrapSetupCodeFailedAttempts >= maxAttempts) {
    return { ok: false, reason: "locked" };
  }

  if (!providedCode || providedCode.trim().length === 0) {
    return { ok: false, reason: "missing" };
  }

  const normalized = normalizeBootstrapSetupCode(providedCode);
  const providedHash = hashBootstrapSetupCode(normalized);
  const valid = timingSafeHexCompare(systemConfig.bootstrapSetupCodeHash, providedHash);

  if (!valid) {
    await prisma.systemConfig.update({
      where: { id: DEFAULT_SYSTEM_CONFIG_ID },
      data: {
        bootstrapSetupCodeFailedAttempts: { increment: 1 },
      },
    });
    return { ok: false, reason: "invalid" };
  }

  await prisma.systemConfig.update({
    where: { id: DEFAULT_SYSTEM_CONFIG_ID },
    data: {
      bootstrapSetupCodeHash: null,
      bootstrapSetupCodeIssuedAt: null,
      bootstrapSetupCodeExpiresAt: null,
      bootstrapSetupCodeFailedAttempts: 0,
    },
  });

  return { ok: true };
};
