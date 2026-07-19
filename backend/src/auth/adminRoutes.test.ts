import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerAdminRoutes } from "./adminRoutes";
import { encodeStoredAiProfiles } from "../ai/settings";

const buildApp = (options?: {
  authMode?: "local" | "hybrid" | "oidc_enforced";
  oidcEnabled?: boolean;
  role?: "ADMIN" | "USER";
  authEnabled?: boolean;
}) => {
  const router = express.Router();
  router.use(express.json());

  const prisma = {
    systemConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
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
        role: options?.role ?? "ADMIN",
      };
      next();
    }) as any,
    accountActionRateLimiter: ((_req: any, _res: any, next: any) =>
      next()) as any,
    ensureAuthEnabled: vi.fn().mockImplementation(async (res: any) => {
      if (options?.authEnabled === false) {
        res.status(404).json({ error: "Not found" });
        return false;
      }
      return true;
    }),
    ensureSystemConfig: vi.fn().mockResolvedValue({
      id: "default",
      oidcJitProvisioningEnabled: null,
      authLoginRateLimitEnabled: true,
      authLoginRateLimitWindowMs: 900000,
      authLoginRateLimitMax: 20,
    }),
    parseLoginRateLimitConfig: vi
      .fn()
      .mockReturnValue({ enabled: true, windowMs: 900000, max: 20 }),
    applyLoginRateLimitConfig: vi
      .fn()
      .mockReturnValue({ enabled: true, windowMs: 900000, max: 20 }),
    resetLoginAttemptKey: vi.fn(),
    requireAdmin: ((req: any, res: any) => {
      if (req.user?.role === "ADMIN") return true;
      res.status(403).json({ error: "Forbidden" });
      return false;
    }) as any,
    findUserByIdentifier: vi.fn(),
    countActiveAdmins: vi.fn().mockResolvedValue(1),
    sanitizeText: (input: unknown) => String(input ?? "").trim(),
    generateTempPassword: vi.fn().mockReturnValue("TempPass123!"),
    generateTokens: vi
      .fn()
      .mockReturnValue({ accessToken: "a", refreshToken: "r" }),
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

    const response = await request(app)
      .post("/registration/toggle")
      .send({ enabled: true });

    expect(response.status).toBe(409);
    expect(response.body?.message).toContain("Local self-sign-up");
  });

  it("updates the persisted OIDC JIT provisioning override", async () => {
    const { app, prisma } = buildApp({
      authMode: "oidc_enforced",
      oidcEnabled: true,
    });
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
      }),
    );
    expect(response.body?.oidcJitProvisioningEnabled).toBe(false);
  });

  it("creates an invited OIDC-only user without a local password", async () => {
    const { app, prisma } = buildApp({
      authMode: "oidc_enforced",
      oidcEnabled: true,
    });
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
      }),
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
    expect(response.body?.message).toContain(
      "OIDC-only invited users require OIDC",
    );
  });

  it.each([
    { authMode: "local" as const, oidcEnabled: false },
    { authMode: "oidc_enforced" as const, oidcEnabled: true },
  ])(
    "allows admins to read AI settings in $authMode mode",
    async ({ authMode, oidcEnabled }) => {
      const { app, prisma } = buildApp({ authMode, oidcEnabled });
      prisma.systemConfig.findUnique.mockResolvedValue(null);

      const response = await request(app).get("/ai/settings");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("providers");
    },
  );

  it("keeps login rate limit administration unavailable without OIDC", async () => {
    const { app } = buildApp({ authMode: "local", oidcEnabled: false });

    const response = await request(app).get("/rate-limit/login");

    expect(response.status).toBe(404);
    expect(response.body?.message).toContain("requires OIDC");
  });

  it("keeps login rate limit administration available with OIDC", async () => {
    const { app } = buildApp({ authMode: "hybrid", oidcEnabled: true });

    const response = await request(app).get("/rate-limit/login");

    expect(response.status).toBe(200);
    expect(response.body?.config).toEqual({
      enabled: true,
      windowMs: 900000,
      max: 20,
    });
  });
});

describe("AI provider administration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["local", false],
    ["hybrid", true],
    ["oidc_enforced", true],
  ] as const)(
    "is admin-authorized and independent of identity-provider mode (%s)",
    async (authMode, oidcEnabled) => {
      const { app } = buildApp({ authMode, oidcEnabled });
      const response = await request(app).get("/ai/settings");
      expect(response.status).toBe(200);
      expect(response.body.providerDefinitions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "openai" }),
          expect.objectContaining({ id: "opencode_go" }),
        ]),
      );
      expect(JSON.stringify(response.body)).not.toContain("apiKeyEncrypted");
    },
  );

  it("remains available to the bootstrap admin when authentication is disabled", async () => {
    const { app } = buildApp({
      authMode: "local",
      oidcEnabled: false,
      authEnabled: false,
    });
    const response = await request(app).get("/ai/settings");
    expect(response.status).toBe(200);
  });

  it("rejects non-admin provider tests before making an external request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { app } = buildApp({ role: "USER" });
    const response = await request(app).post("/ai/providers/test").send({
      provider: "openai",
      apiKey: "sk-secret",
      model: "gpt-5.4",
    });
    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("tests unsaved edits with a stored key without returning the secret", async () => {
    const { app, prisma } = buildApp();
    prisma.systemConfig.findUnique.mockResolvedValue({
      aiProviderProfiles: encodeStoredAiProfiles([
        {
          id: "stored",
          label: "Stored",
          provider: "openai",
          enabled: true,
          baseUrl: null,
          models: [{ id: "gpt-5.4", label: "GPT-5.4", reasoningEfforts: [] }],
          apiKey: "sk-stored-secret",
        },
      ]),
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: "gpt-5.4" }] }), {
          status: 200,
        }),
      );
    const response = await request(app).post("/ai/providers/test").send({
      profileId: "stored",
      provider: "openai",
      model: "gpt-5.4",
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, code: "success" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({
        headers: { authorization: "Bearer sk-stored-secret" },
      }),
    );
    expect(JSON.stringify(response.body)).not.toContain("sk-stored-secret");
  });
});
