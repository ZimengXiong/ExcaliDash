import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerCoreRoutes } from "./coreRoutes";

const buildApp = (options?: {
  authMode?: "local" | "hybrid" | "oidc_enforced";
  registrationEnabled?: boolean;
  oidcJitProvisioningEnabled?: boolean | null;
}) => {
  const router = express.Router();
  const prisma = {
    user: {
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    drawing: {
      count: vi.fn().mockResolvedValue(0),
    },
    collection: {
      count: vi.fn().mockResolvedValue(0),
    },
  } as any;

  registerCoreRoutes({
    router,
    prisma,
    requireAuth: ((_req: any, _res: any, next: any) => next()) as any,
    optionalAuth: ((_req: any, _res: any, next: any) => next()) as any,
    loginAttemptRateLimiter: ((_req: any, _res: any, next: any) => next()) as any,
    ensureAuthEnabled: vi.fn().mockResolvedValue(true),
    ensureSystemConfig: vi.fn().mockResolvedValue({
      id: "default",
      authEnabled: true,
      authOnboardingCompleted: true,
      registrationEnabled: options?.registrationEnabled ?? true,
      oidcJitProvisioningEnabled: options?.oidcJitProvisioningEnabled ?? null,
    }),
    findUserByIdentifier: vi.fn(),
    sanitizeText: (input: unknown) => String(input ?? "").trim(),
    requireCsrf: vi.fn().mockReturnValue(true),
    isJwtPayload: ((decoded: any) => Boolean(decoded && decoded.userId)) as any,
    config: {
      authMode: options?.authMode ?? "oidc_enforced",
      jwtSecret: "test-secret",
      jwtAccessExpiresIn: "15m",
      enableRefreshTokenRotation: false,
      enableAuditLogging: false,
      oidc: {
        enabled: (options?.authMode ?? "oidc_enforced") !== "local",
        enforced: (options?.authMode ?? "oidc_enforced") === "oidc_enforced",
        providerName: "Test OIDC",
        jitProvisioning: false,
      },
      bootstrapSetupCodeTtlMs: 900000,
      bootstrapSetupCodeMaxAttempts: 5,
    },
    generateTokens: vi.fn().mockReturnValue({ accessToken: "access", refreshToken: "refresh" }),
    getRefreshTokenExpiresAt: vi.fn().mockReturnValue(new Date()),
    isMissingRefreshTokenTableError: vi.fn().mockReturnValue(false),
    bootstrapUserId: "bootstrap-user",
    defaultSystemConfigId: "default",
    clearAuthEnabledCache: vi.fn(),
    setAuthCookies: vi.fn(),
    setAccessTokenCookie: vi.fn(),
    clearAuthCookies: vi.fn(),
    readRefreshTokenFromRequest: vi.fn().mockReturnValue(null),
  });

  const app = express();
  app.use(router);
  return { app };
};

describe("/auth/status registration policy", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reports local registration disabled in oidc_enforced mode even if the persisted flag is true", async () => {
    const { app } = buildApp({
      authMode: "oidc_enforced",
      registrationEnabled: true,
      oidcJitProvisioningEnabled: false,
    });

    const response = await request(app).get("/status");

    expect(response.status).toBe(200);
    expect(response.body?.authMode).toBe("oidc_enforced");
    expect(response.body?.registrationEnabled).toBe(false);
    expect(response.body?.oidcJitProvisioningEnabled).toBe(false);
  });

  it("hides any optional-auth user context when auth is effectively disabled", async () => {
    const router = express.Router();
    const prisma = {
      user: {
        count: vi.fn().mockResolvedValue(0),
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
      drawing: {
        count: vi.fn().mockResolvedValue(0),
      },
      collection: {
        count: vi.fn().mockResolvedValue(0),
      },
    } as any;

    registerCoreRoutes({
      router,
      prisma,
      requireAuth: ((_req: any, _res: any, next: any) => next()) as any,
      optionalAuth: ((req: any, _res: any, next: any) => {
        req.user = {
          id: "bootstrap-user",
          email: "bootstrap@excalidash.local",
          name: "Bootstrap Admin",
          role: "ADMIN",
        };
        next();
      }) as any,
      loginAttemptRateLimiter: ((_req: any, _res: any, next: any) => next()) as any,
      ensureAuthEnabled: vi.fn().mockResolvedValue(true),
      ensureSystemConfig: vi.fn().mockResolvedValue({
        id: "default",
        authEnabled: false,
        authOnboardingCompleted: false,
        registrationEnabled: true,
        oidcJitProvisioningEnabled: null,
      }),
      findUserByIdentifier: vi.fn(),
      sanitizeText: (input: unknown) => String(input ?? "").trim(),
      requireCsrf: vi.fn().mockReturnValue(true),
      isJwtPayload: ((decoded: any) => Boolean(decoded && decoded.userId)) as any,
      config: {
        authMode: "local",
        jwtSecret: "test-secret",
        jwtAccessExpiresIn: "15m",
        enableRefreshTokenRotation: false,
        enableAuditLogging: false,
        oidc: {
          enabled: false,
          enforced: false,
          providerName: "OIDC",
          jitProvisioning: false,
        },
        bootstrapSetupCodeTtlMs: 900000,
        bootstrapSetupCodeMaxAttempts: 5,
      },
      generateTokens: vi.fn().mockReturnValue({ accessToken: "access", refreshToken: "refresh" }),
      getRefreshTokenExpiresAt: vi.fn().mockReturnValue(new Date()),
      isMissingRefreshTokenTableError: vi.fn().mockReturnValue(false),
      bootstrapUserId: "bootstrap-user",
      defaultSystemConfigId: "default",
      clearAuthEnabledCache: vi.fn(),
      setAuthCookies: vi.fn(),
      setAccessTokenCookie: vi.fn(),
      clearAuthCookies: vi.fn(),
      readRefreshTokenFromRequest: vi.fn().mockReturnValue(null),
    });

    const app = express();
    app.use(router);

    const response = await request(app).get("/status");

    expect(response.status).toBe(200);
    expect(response.body?.authEnabled).toBe(false);
    expect(response.body?.authenticated).toBe(false);
    expect(response.body?.user).toBeNull();
  });
});
