import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";
import { config } from "../config";
import { createAuthMiddleware } from "./auth";
import { BOOTSTRAP_USER_ID } from "../auth/authMode";

const createRequest = (overrides?: Partial<Request>): Request =>
  ({
    method: "GET",
    originalUrl: "/drawings",
    url: "/drawings",
    headers: {},
    ...overrides,
  }) as Request;

const createResponse = (): Response =>
  ({
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }) as unknown as Response;

const createDeps = () => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
    },
  } as any;

  const authModeService = {
    getAuthEnabled: vi.fn(),
    getBootstrapActingUser: vi.fn(),
  } as any;

  return { prisma, authModeService };
};

const makeAccessToken = (payload?: { userId?: string; email?: string; impersonatorId?: string }) =>
  jwt.sign(
    {
      userId: payload?.userId ?? "user-1",
      email: payload?.email ?? "user-1@test.local",
      type: "access",
      impersonatorId: payload?.impersonatorId,
    },
    config.jwtSecret
  );

const makeRefreshToken = () =>
  jwt.sign(
    {
      userId: "user-1",
      email: "user-1@test.local",
      type: "refresh",
    },
    config.jwtSecret
  );

describe("auth middleware", () => {
  it("treats requests as bootstrap user when auth is disabled", async () => {
    const { prisma, authModeService } = createDeps();
    authModeService.getAuthEnabled.mockResolvedValue(false);
    authModeService.getBootstrapActingUser.mockResolvedValue({
      id: BOOTSTRAP_USER_ID,
      username: null,
      email: "bootstrap@excalidash.local",
      name: "Bootstrap Admin",
      role: "ADMIN",
      mustResetPassword: true,
    });
    const { requireAuth } = createAuthMiddleware({ prisma, authModeService });

    const req = createRequest();
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({
      id: BOOTSTRAP_USER_ID,
      role: "ADMIN",
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns 401 when token is missing and auth is enabled", async () => {
    const { prisma, authModeService } = createDeps();
    authModeService.getAuthEnabled.mockResolvedValue(true);
    const { requireAuth } = createAuthMiddleware({ prisma, authModeService });

    const req = createRequest();
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Authentication token required" })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects non-access JWT payloads", async () => {
    const { prisma, authModeService } = createDeps();
    authModeService.getAuthEnabled.mockResolvedValue(true);
    const { requireAuth } = createAuthMiddleware({ prisma, authModeService });

    const req = createRequest({
      headers: {
        authorization: `Bearer ${makeRefreshToken()}`,
      },
    });
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Invalid or expired token" })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches active user for valid access token", async () => {
    const { prisma, authModeService } = createDeps();
    authModeService.getAuthEnabled.mockResolvedValue(true);
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      username: "user1",
      email: "user-1@test.local",
      name: "User One",
      role: "USER",
      mustResetPassword: false,
      isActive: true,
    });
    const { requireAuth } = createAuthMiddleware({ prisma, authModeService });

    const req = createRequest({
      headers: {
        authorization: `Bearer ${makeAccessToken({ impersonatorId: "admin-1" })}`,
      },
    });
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({
      id: "user-1",
      email: "user-1@test.local",
      impersonatorId: "admin-1",
    });
  });

  it("blocks non-auth routes when password reset is required", async () => {
    const { prisma, authModeService } = createDeps();
    authModeService.getAuthEnabled.mockResolvedValue(true);
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      username: "user1",
      email: "user-1@test.local",
      name: "User One",
      role: "USER",
      mustResetPassword: true,
      isActive: true,
    });
    const { requireAuth } = createAuthMiddleware({ prisma, authModeService });

    const req = createRequest({
      method: "GET",
      originalUrl: "/drawings",
      headers: {
        authorization: `Bearer ${makeAccessToken()}`,
      },
    });
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "MUST_RESET_PASSWORD" })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("allows /api/auth/me when password reset is required", async () => {
    const { prisma, authModeService } = createDeps();
    authModeService.getAuthEnabled.mockResolvedValue(true);
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      username: "user1",
      email: "user-1@test.local",
      name: "User One",
      role: "USER",
      mustResetPassword: true,
      isActive: true,
    });
    const { requireAuth } = createAuthMiddleware({ prisma, authModeService });

    const req = createRequest({
      method: "GET",
      originalUrl: "/api/auth/me?include=roles",
      headers: {
        authorization: `Bearer ${makeAccessToken()}`,
      },
    });
    const res = createResponse();
    const next = vi.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
