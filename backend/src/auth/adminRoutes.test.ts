import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerAdminRoutes } from "./adminRoutes";

const buildApp = (options?: {
  authMode?: "local" | "hybrid" | "oidc_enforced";
  oidcEnabled?: boolean;
}) => {
  const router = express.Router();
  router.use(express.json());

  const prisma = {
    systemConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  } as any;

  registerAdminRoutes({
    router,
    prisma,
    requireAuth: ((req: any, _res: any, next: any) => {
      req.user = {
        id: "admin-id",
        email: "admin@test.local",
        name: "Admin",
        role: "ADMIN",
      };
      next();
    }) as any,
    accountActionRateLimiter: ((_req: any, _res: any, next: any) => next()) as any,
    ensureAuthEnabled: vi.fn().mockResolvedValue(true),
    ensureSystemConfig: vi.fn().mockResolvedValue({
      id: "default",
      oidcJitProvisioningEnabled: null,
      authLoginRateLimitEnabled: true,
      authLoginRateLimitWindowMs: 900000,
      authLoginRateLimitMax: 20,
    }),
    parseLoginRateLimitConfig: vi.fn().mockReturnValue({ enabled: true, windowMs: 900000, max: 20 }),
    applyLoginRateLimitConfig: vi.fn().mockReturnValue({ enabled: true, windowMs: 900000, max: 20 }),
    resetLoginAttemptKey: vi.fn(),
    requireAdmin: ((req: any, _res: any) => Boolean(req.user && req.user.role === "ADMIN")) as any,
    findUserByIdentifier: vi.fn(),
    countActiveAdmins: vi.fn().mockResolvedValue(1),
    sanitizeText: (input: unknown) => String(input ?? "").trim(),
    generateTempPassword: vi.fn().mockReturnValue("TempPass123!"),
    generateTokens: vi.fn().mockReturnValue({ accessToken: "a", refreshToken: "r" }),
    getRefreshTokenExpiresAt: vi.fn().mockReturnValue(new Date()),
    config: {
      authMode: options?.authMode ?? "oidc_enforced",
      enableAuditLogging: false,
      enableRefreshTokenRotation: false,
      oidc: {
        enabled: options?.oidcEnabled ?? true,
        providerName: "Auth0",
        jitProvisioning: true,
      },
    },
    defaultSystemConfigId: "default",
    setAuthCookies: vi.fn(),
    requireCsrf: vi.fn().mockReturnValue(true),
  });

  const app = express();
  app.use(router);
  return { app, prisma };
};

describe("admin OIDC access controls", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects local registration toggle in oidc_enforced mode", async () => {
    const { app } = buildApp({ authMode: "oidc_enforced", oidcEnabled: true });

    const response = await request(app).post("/registration/toggle").send({ enabled: true });

    expect(response.status).toBe(409);
    expect(response.body?.message).toContain("Local self-sign-up");
  });

  it("updates the persisted OIDC JIT provisioning override", async () => {
    const { app, prisma } = buildApp({ authMode: "oidc_enforced", oidcEnabled: true });
    prisma.systemConfig.upsert.mockResolvedValue({
      id: "default",
      oidcJitProvisioningEnabled: false,
    });

    const response = await request(app)
      .post("/oidc/jit-provisioning")
      .send({ enabled: false });

    expect(response.status).toBe(200);
    expect(prisma.systemConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { oidcJitProvisioningEnabled: false },
      })
    );
    expect(response.body?.oidcJitProvisioningEnabled).toBe(false);
  });

  it("creates an invited OIDC-only user without a local password", async () => {
    const { app, prisma } = buildApp({ authMode: "oidc_enforced", oidcEnabled: true });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: any) => ({
      id: "user-1",
      username: data.username,
      email: data.email,
      name: data.name,
      role: data.role,
      mustResetPassword: data.mustResetPassword,
      isActive: data.isActive,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const response = await request(app).post("/users").send({
      email: "invitee@example.com",
      name: "Invitee",
      oidcOnly: true,
      role: "USER",
      isActive: true,
    });

    expect(response.status).toBe(201);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "invitee@example.com",
          passwordHash: "",
          mustResetPassword: false,
        }),
      })
    );
  });

  it("rejects OIDC-only invited users when OIDC is disabled", async () => {
    const { app } = buildApp({ authMode: "local", oidcEnabled: false });

    const response = await request(app).post("/users").send({
      email: "invitee@example.com",
      name: "Invitee",
      oidcOnly: true,
    });

    expect(response.status).toBe(409);
    expect(response.body?.message).toContain("OIDC-only invited users require OIDC");
  });
});

describe("admin AI settings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns configuration metadata without exposing the encrypted key", async () => {
    const { app, prisma } = buildApp({ authMode: "local" });
    prisma.systemConfig.findUnique.mockResolvedValue({
      id: "default",
      aiProvider: "openai",
      aiBaseUrl: "https://api.openai.com/v1",
      aiModel: "gpt-4o",
      aiApiKeyEncrypted: "aesgcm$secret-material",
      aiChatgptEnabled: true,
    });

    const response = await request(app).get("/ai/settings");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      overrides: {
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o",
      },
      dbKeyConfigured: true,
    });
    expect(JSON.stringify(response.body)).not.toContain("secret-material");
  });

  it("encrypts an API key before persistence and never returns it", async () => {
    const { app, prisma } = buildApp({ authMode: "local" });
    prisma.systemConfig.upsert.mockImplementation(async ({ update }: any) => ({
      id: "default",
      aiProvider: "openai",
      aiBaseUrl: null,
      aiModel: "gpt-4o",
      aiApiKeyEncrypted: update.aiApiKeyEncrypted,
      aiChatgptEnabled: true,
    }));

    const response = await request(app).put("/ai/settings").send({
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-test-plaintext",
    });

    expect(response.status).toBe(200);
    const persisted = prisma.systemConfig.upsert.mock.calls[0][0].update;
    expect(persisted.aiApiKeyEncrypted).toMatch(/^aesgcm\$/);
    expect(persisted.aiApiKeyEncrypted).not.toContain("sk-test-plaintext");
    expect(JSON.stringify(response.body)).not.toContain("sk-test-plaintext");
    expect(response.body.dbKeyConfigured).toBe(true);
  });

  it("rejects a base URL with embedded credentials", async () => {
    const { app, prisma } = buildApp({ authMode: "local" });

    const response = await request(app).put("/ai/settings").send({
      provider: "custom",
      baseUrl: "https://user:password@example.com/v1",
    });

    expect(response.status).toBe(400);
    expect(prisma.systemConfig.upsert).not.toHaveBeenCalled();
  });
});
