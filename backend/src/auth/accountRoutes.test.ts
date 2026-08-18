import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerAccountRoutes } from "./accountRoutes";

const buildApp = (options?: {
  impersonatorId?: string;
  nodeEnv?: string;
  mailer?: { enabled: boolean; send: ReturnType<typeof vi.fn> };
}) => {
  const router = express.Router();
  router.use(express.json());

  const prisma = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    passwordResetToken: {
      updateMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    refreshToken: {
      updateMany: vi.fn(),
    },
    apiKey: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  } as any;

  registerAccountRoutes({
    router,
    prisma,
    requireAuth: ((req: any, _res: any, next: any) => {
      req.user = {
        id: "user-1",
        email: "user@example.com",
        name: "User",
        role: "USER",
        impersonatorId: options?.impersonatorId,
      };
      next();
    }) as any,
    loginAttemptRateLimiter: ((_req: any, _res: any, next: any) => next()) as any,
    accountActionRateLimiter: ((_req: any, _res: any, next: any) => next()) as any,
    ensureAuthEnabled: vi.fn().mockResolvedValue(true),
    sanitizeText: (input: unknown) => String(input ?? "").trim(),
    config: {
      enablePasswordReset: true,
      enableAuditLogging: false,
      enableRefreshTokenRotation: false,
      nodeEnv: options?.nodeEnv ?? "test",
      frontendUrl: "http://localhost:6767",
    },
    generateTokens: vi.fn().mockReturnValue({ accessToken: "access", refreshToken: "refresh" }),
    getRefreshTokenExpiresAt: vi.fn().mockReturnValue(new Date()),
    setAuthCookies: vi.fn(),
    requireCsrf: vi.fn().mockReturnValue(true),
    mailer: options?.mailer as any,
  });

  const app = express();
  app.use(router);
  return { app, prisma, mailer: options?.mailer };
};

describe("accountRoutes local-password safeguards", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not issue password reset tokens for OIDC-only accounts", async () => {
    const { app, prisma } = buildApp();
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "invitee@example.com",
      isActive: true,
      passwordHash: "",
    });

    const response = await request(app)
      .post("/password-reset-request")
      .send({ email: "invitee@example.com" });

    expect(response.status).toBe(200);
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(prisma.passwordResetToken.updateMany).not.toHaveBeenCalled();
  });

  it("still issues password reset tokens for local-password accounts", async () => {
    const { app, prisma } = buildApp();
    prisma.user.findUnique.mockResolvedValue({
      id: "user-2",
      email: "local@example.com",
      isActive: true,
      passwordHash: "$2a$10$abcdefghijklmnopqrstuv",
    });

    const response = await request(app)
      .post("/password-reset-request")
      .send({ email: "local@example.com" });

    expect(response.status).toBe(200);
    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
  });

  it("rejects password reset confirmation for accounts without a local password", async () => {
    const { app, prisma } = buildApp();
    prisma.passwordResetToken.findFirst.mockResolvedValue({
      id: "reset-1",
      userId: "user-1",
      used: false,
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: "user-1",
        isActive: true,
        passwordHash: "",
      },
    });

    const response = await request(app).post("/password-reset-confirm").send({
      token: "deadbeef",
      password: "NewPass1234!",
    });

    expect(response.status).toBe(400);
    expect(response.body?.message).toContain("not available");
    expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
      where: { id: "reset-1" },
      data: { used: true },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects API key revocation while impersonating", async () => {
    const { app, prisma } = buildApp({ impersonatorId: "admin-1" });

    const response = await request(app).delete("/api-keys/key-1");

    expect(response.status).toBe(403);
    expect(response.body?.message).toContain("impersonating");
    expect(prisma.apiKey.findFirst).not.toHaveBeenCalled();
    expect(prisma.apiKey.update).not.toHaveBeenCalled();
  });

  it("creates API keys with sanitized custom scopes", async () => {
    const { app, prisma } = buildApp();
    prisma.apiKey.create.mockImplementation(async ({ data }: any) => ({
      id: "key-1",
      name: data.name,
      prefix: data.prefix,
      scopes: data.scopes,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date("2026-05-01T12:00:00.000Z"),
      updatedAt: new Date("2026-05-01T12:00:00.000Z"),
    }));

    const response = await request(app).post("/api-keys").send({
      name: "Scoped Key",
      scopes: [" drawings:read ", "drawings:read", "collections:write"],
    });

    expect(response.status).toBe(201);
    expect(prisma.apiKey.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: "Scoped Key",
        scopes: "drawings:read,collections:write",
      }),
    }));
    expect(response.body.apiKey.scopes).toEqual(["drawings:read", "collections:write"]);
    expect(response.body.token).toMatch(/^exd_/);
  });

  it("keeps default API key scopes when scopes are omitted", async () => {
    const { app, prisma } = buildApp();
    prisma.apiKey.create.mockImplementation(async ({ data }: any) => ({
      id: "key-1",
      name: data.name,
      prefix: data.prefix,
      scopes: data.scopes,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date("2026-05-01T12:00:00.000Z"),
      updatedAt: new Date("2026-05-01T12:00:00.000Z"),
    }));

    const response = await request(app).post("/api-keys").send({ name: "Default Key" });

    expect(response.status).toBe(201);
    expect(prisma.apiKey.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        scopes: "drawings:read,drawings:write,collections:read,collections:write",
      }),
    }));
  });

  it("rejects API key creation with no scopes", async () => {
    const { app, prisma } = buildApp();

    const response = await request(app).post("/api-keys").send({
      name: "No Scopes",
      scopes: [],
    });

    expect(response.status).toBe(400);
    expect(response.body?.message).toContain("at least one");
    expect(prisma.apiKey.create).not.toHaveBeenCalled();
  });

  it("rejects API key creation with invalid scopes", async () => {
    const { app, prisma } = buildApp();

    const response = await request(app).post("/api-keys").send({
      name: "Bad Scope",
      scopes: ["drawings:read", "admin:write"],
    });

    expect(response.status).toBe(400);
    expect(response.body?.message).toContain("valid API key scope");
    expect(prisma.apiKey.create).not.toHaveBeenCalled();
  });
});

describe("password reset delivery", () => {
  const localUser = {
    id: "user-1",
    email: "user@example.com",
    isActive: true,
    passwordHash: "$2b$12$abcdefghijklmnopqrstuv",
  };

  const buildMailer = () => ({
    enabled: true,
    send: vi.fn().mockResolvedValue({ delivered: true, id: "mail-1" }),
  });

  it("sends the reset link to the account address", async () => {
    const mailer = buildMailer();
    const { app, prisma } = buildApp({ mailer });
    prisma.user.findUnique.mockResolvedValue(localUser);
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    prisma.passwordResetToken.create.mockResolvedValue({});

    const res = await request(app)
      .post("/password-reset-request")
      .send({ email: localUser.email });

    expect(res.status).toBe(200);
    expect(mailer.send).toHaveBeenCalledTimes(1);
    const sent = mailer.send.mock.calls[0][0];
    expect(sent.to).toBe(localUser.email);
    expect(sent.text).toContain("/reset-password-confirm?token=");
    expect(sent.idempotencyKey).toMatch(/^password-reset\//);
  });

  it("sends nothing for an unknown address but answers the same", async () => {
    const mailer = buildMailer();
    const { app, prisma } = buildApp({ mailer });
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/password-reset-request")
      .send({ email: "nobody@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account/i);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("still answers neutrally when the provider fails", async () => {
    const mailer = {
      enabled: true,
      send: vi.fn().mockResolvedValue({ delivered: false, reason: "quota" }),
    };
    const { app, prisma } = buildApp({ mailer });
    prisma.user.findUnique.mockResolvedValue(localUser);
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    prisma.passwordResetToken.create.mockResolvedValue({});

    const res = await request(app)
      .post("/password-reset-request")
      .send({ email: localUser.email });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account/i);
  });

  it("reports an outage in production when no provider is configured", async () => {
    const { app, prisma } = buildApp({ nodeEnv: "production" });

    const res = await request(app)
      .post("/password-reset-request")
      .send({ email: localUser.email });

    expect(res.status).toBe(503);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
