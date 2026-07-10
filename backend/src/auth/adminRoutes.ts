import express, { Request, Response } from "express";
import { PrismaClient } from "../generated/client";
import { registerAdminImpersonationRoutes } from "./adminImpersonationRoutes";
import { registerAdminSettingsRoutes } from "./adminSettingsRoutes";
import { registerAdminUserRoutes } from "./adminUserRoutes";

export type RegisterAdminRoutesDeps = {
  router: express.Router;
  prisma: PrismaClient;
  requireAuth: express.RequestHandler;
  accountActionRateLimiter: express.RequestHandler;
  ensureAuthEnabled: (res: Response) => Promise<boolean>;
  ensureSystemConfig: () => Promise<{
    id: string;
    oidcJitProvisioningEnabled: boolean | null;
    authLoginRateLimitEnabled: boolean;
    authLoginRateLimitWindowMs: number;
    authLoginRateLimitMax: number;
  }>;
  parseLoginRateLimitConfig: (systemConfig: {
    authLoginRateLimitEnabled: boolean;
    authLoginRateLimitWindowMs: number;
    authLoginRateLimitMax: number;
  }) => { enabled: boolean; windowMs: number; max: number };
  applyLoginRateLimitConfig: (systemConfig: {
    authLoginRateLimitEnabled: boolean;
    authLoginRateLimitWindowMs: number;
    authLoginRateLimitMax: number;
  }) => { enabled: boolean; windowMs: number; max: number };
  resetLoginAttemptKey: (identifier: string) => Promise<void>;
  requireAdmin: (
    req: Request,
    res: Response,
  ) => req is Request & { user: NonNullable<Request["user"]> };
  findUserByIdentifier: (
    identifier: string,
  ) => Promise<{
    id: string;
    username: string | null;
    email: string;
    name: string;
    role: string;
    isActive: boolean;
    mustResetPassword: boolean;
    passwordHash: string;
  } | null>;
  countActiveAdmins: () => Promise<number>;
  sanitizeText: (input: unknown, maxLength?: number) => string;
  generateTempPassword: () => string;
  generateTokens: (
    userId: string,
    email: string,
    options?: {
      impersonatorId?: string;
      authProvider?: "local" | "oidc";
      oidcGroups?: string[];
    },
  ) => { accessToken: string; refreshToken: string };
  getRefreshTokenExpiresAt: () => Date;
  config: {
    authMode: "local" | "hybrid" | "oidc_enforced" | "disabled";
    enableAuditLogging: boolean;
    enableRefreshTokenRotation: boolean;
    oidc: { enabled: boolean; providerName: string; jitProvisioning: boolean };
  };
  defaultSystemConfigId: string;
  setAuthCookies: (
    req: Request,
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
  ) => void;
  requireCsrf: (req: Request, res: Response) => boolean;
};

export const registerAdminRoutes = (deps: RegisterAdminRoutesDeps) => {
  registerAdminSettingsRoutes(deps);
  registerAdminUserRoutes(deps);
  registerAdminImpersonationRoutes(deps);
};
