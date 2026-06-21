import { PrismaClient } from "../generated/client";
import { config } from "../config";

export const BOOTSTRAP_USER_ID = "bootstrap-admin";
export const DEFAULT_SYSTEM_CONFIG_ID = "default";

type AuthEnabledCache = {
  value: boolean;
  fetchedAt: number;
};

export type AuthModeService = ReturnType<typeof createAuthModeService>;

export const createAuthModeService = (
  prisma: PrismaClient,
  options?: { authEnabledTtlMs?: number }
) => {
  const authEnabledTtlMs = options?.authEnabledTtlMs ?? 5000;
  let authEnabledCache: AuthEnabledCache | null = null;

  const getSystemConfigAuthEnabled = async () => {
    return prisma.systemConfig.findUnique({
      where: { id: DEFAULT_SYSTEM_CONFIG_ID },
      select: { authEnabled: true },
    });
  };

  const ensureSystemConfig = async () => {
    return prisma.systemConfig.upsert({
      where: { id: DEFAULT_SYSTEM_CONFIG_ID },
      update: {},
      create: {
        id: DEFAULT_SYSTEM_CONFIG_ID,
        authEnabled: config.authMode !== "local",
        authOnboardingCompleted: false,
        registrationEnabled: false,
        oidcJitProvisioningEnabled: null,
        authLoginRateLimitEnabled: true,
        authLoginRateLimitWindowMs: 15 * 60 * 1000,
        authLoginRateLimitMax: 20,
      },
    });
  };

  const getAuthEnabled = async (): Promise<boolean> => {
    if (config.authMode !== "local") {
      const now = Date.now();
      authEnabledCache = { value: true, fetchedAt: now };
      return true;
    }

    const now = Date.now();
    if (authEnabledCache && now - authEnabledCache.fetchedAt < authEnabledTtlMs) {
      return authEnabledCache.value;
    }

    const existingSystemConfig = await getSystemConfigAuthEnabled();
    if (existingSystemConfig) {
      authEnabledCache = { value: existingSystemConfig.authEnabled, fetchedAt: now };
      return existingSystemConfig.authEnabled;
    }

    const systemConfig = await ensureSystemConfig();
    authEnabledCache = { value: systemConfig.authEnabled, fetchedAt: now };
    return systemConfig.authEnabled;
  };

  const clearAuthEnabledCache = () => {
    authEnabledCache = null;
  };

  const getBootstrapActingUser = async () => {
    return prisma.user.upsert({
      where: { id: BOOTSTRAP_USER_ID },
      update: {},
      create: {
        id: BOOTSTRAP_USER_ID,
        email: "bootstrap@excalidash.local",
        username: null,
        passwordHash: "",
        name: "Bootstrap Admin",
        role: "ADMIN",
        mustResetPassword: true,
        isActive: false,
      },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        role: true,
        mustResetPassword: true,
        isActive: true,
      },
    });
  };

  return {
    ensureSystemConfig,
    getAuthEnabled,
    clearAuthEnabledCache,
    getBootstrapActingUser,
  };
};
