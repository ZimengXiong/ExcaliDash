import { PrismaClient } from "../generated/client";
import { getEffectiveRegistrationEnabled } from "./accessPolicy";

type AuthMode = "local" | "hybrid" | "oidc_enforced";

type AuthUser = {
  id: string;
  username?: string | null;
  email: string;
  name: string;
  role?: string;
  mustResetPassword?: boolean;
  impersonatorId?: string;
} | null | undefined;

export const getAuthOnboardingStatus = async (
  prisma: PrismaClient,
  systemConfig: {
    authEnabled: boolean;
    authOnboardingCompleted: boolean;
  }
) => {
  const [activeUsers, drawingsCount, collectionsCount] = await Promise.all([
    prisma.user.count({ where: { isActive: true } }),
    prisma.drawing.count(),
    prisma.collection.count(),
  ]);
  const hasLegacyData = drawingsCount > 0 || collectionsCount > 0;
  const needsChoice =
    !systemConfig.authEnabled &&
    activeUsers === 0 &&
    !systemConfig.authOnboardingCompleted;

  return {
    activeUsers,
    hasLegacyData,
    needsChoice,
    mode: hasLegacyData ? "migration" : "fresh",
  } as const;
};

export const ensureBootstrapUserExists = async (
  prisma: PrismaClient,
  bootstrapUserId: string
): Promise<void> => {
  const bootstrap = await prisma.user.findUnique({
    where: { id: bootstrapUserId },
    select: { id: true },
  });
  if (bootstrap) return;

  await prisma.user.create({
    data: {
      id: bootstrapUserId,
      email: "bootstrap@excalidash.local",
      username: null,
      passwordHash: "",
      name: "Bootstrap Admin",
      role: "ADMIN",
      mustResetPassword: true,
      isActive: false,
    },
  });
};

export const buildAuthStatusPayload = ({
  authMode,
  oidc,
  systemConfig,
  effectiveAuthEnabled,
  oidcJitProvisioningEnabled,
  onboarding,
  bootstrapRequired,
  user,
}: {
  authMode: AuthMode;
  oidc: {
    enabled: boolean;
    enforced: boolean;
    providerName: string;
  };
  systemConfig: {
    registrationEnabled: boolean;
  };
  effectiveAuthEnabled: boolean;
  oidcJitProvisioningEnabled: boolean;
  onboarding: {
    needsChoice: boolean;
    mode: "migration" | "fresh";
  };
  bootstrapRequired: boolean;
  user: AuthUser;
}) => {
  const onboardingRequired = authMode === "local" ? onboarding.needsChoice : false;
  const onboardingMode = authMode === "local" ? onboarding.mode : null;
  const exposedUser = effectiveAuthEnabled ? user : null;

  return {
    enabled: effectiveAuthEnabled,
    authenticated: Boolean(exposedUser),
    authEnabled: effectiveAuthEnabled,
    authMode,
    oidcEnabled: oidc.enabled,
    oidcEnforced: oidc.enforced,
    oidcProvider: oidc.providerName,
    oidcJitProvisioningEnabled,
    registrationEnabled: effectiveAuthEnabled
      ? getEffectiveRegistrationEnabled(authMode, systemConfig.registrationEnabled)
      : false,
    bootstrapRequired: effectiveAuthEnabled ? bootstrapRequired : false,
    authOnboardingRequired: onboardingRequired,
    authOnboardingMode: onboardingMode,
    authOnboardingRecommended: onboardingRequired ? "enable" : null,
    user: exposedUser
      ? {
          id: exposedUser.id,
          username: exposedUser.username ?? null,
          email: exposedUser.email,
          name: exposedUser.name,
          role: exposedUser.role,
          mustResetPassword: exposedUser.mustResetPassword ?? false,
          impersonatorId: exposedUser.impersonatorId,
        }
      : null,
  };
};

export const upsertAuthModeState = async ({
  prisma,
  defaultSystemConfigId,
  registrationEnabled,
  authEnabled,
  authOnboardingCompleted = true,
}: {
  prisma: PrismaClient;
  defaultSystemConfigId: string;
  registrationEnabled: boolean;
  authEnabled: boolean;
  authOnboardingCompleted?: boolean;
}) =>
  prisma.systemConfig.upsert({
    where: { id: defaultSystemConfigId },
    update: { authEnabled, authOnboardingCompleted },
    create: {
      id: defaultSystemConfigId,
      authEnabled,
      authOnboardingCompleted,
      registrationEnabled,
    },
  });

export const getBootstrapRequired = ({
  authEnabled,
  oidcEnforced,
  bootstrapUser,
  activeUsers,
}: {
  authEnabled: boolean;
  oidcEnforced: boolean;
  bootstrapUser: { isActive: boolean } | null;
  activeUsers: number;
}) =>
  Boolean(authEnabled && !oidcEnforced && bootstrapUser && bootstrapUser.isActive === false) &&
  activeUsers === 0;
