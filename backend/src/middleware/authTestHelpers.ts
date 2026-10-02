import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { vi } from "vitest";
import { config } from "../config";

export const createRequest = (overrides?: Partial<Request>): Request =>
  ({
    method: "GET",
    originalUrl: "/drawings",
    url: "/drawings",
    headers: {},
    ...overrides,
  }) as Request;

export const createResponse = (): Response =>
  ({
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }) as unknown as Response;

export const createDeps = () => {
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    authIdentity: { findUnique: vi.fn() },
    apiKey: { findUnique: vi.fn(), update: vi.fn() },
  } as any;
  const authModeService = {
    getAuthEnabled: vi.fn(),
    getBootstrapActingUser: vi.fn(),
  } as any;
  return { prisma, authModeService };
};

export const makeAccessToken = (payload?: {
  userId?: string;
  email?: string;
  impersonatorId?: string;
}) =>
  jwt.sign(
    {
      userId: payload?.userId ?? "user-1",
      email: payload?.email ?? "user-1@test.local",
      type: "access",
      impersonatorId: payload?.impersonatorId,
    },
    config.jwtSecret,
  );

export const makeOidcAccessToken = (payload?: {
  userId?: string;
  email?: string;
  oidcGroups?: string[];
  authProvider?: "local" | "oidc";
}) =>
  jwt.sign(
    {
      userId: payload?.userId ?? "user-1",
      email: payload?.email ?? "user-1@test.local",
      type: "access",
      authProvider: payload?.authProvider ?? "oidc",
      oidcGroups: payload?.oidcGroups ?? [],
    },
    config.jwtSecret,
  );

export const makeRefreshToken = () =>
  jwt.sign(
    { userId: "user-1", email: "user-1@test.local", type: "refresh" },
    config.jwtSecret,
  );
