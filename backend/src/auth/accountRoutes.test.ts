import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerAccountRoutes } from "./accountRoutes";

const buildApp = () => {
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
      nodeEnv: "test",
      frontendUrl: "http://localhost:6767",
    },
    generateTokens: vi.fn().mockReturnValue({ accessToken: "access", refreshToken: "refresh" }),
    getRefreshTokenExpiresAt: vi.fn().mockReturnValue(new Date()),
    setAuthCookies: vi.fn(),
    requireCsrf: vi.fn().mockReturnValue(true),
  });

  const app = express();
  app.use(router);
  return { app, prisma };
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
});
