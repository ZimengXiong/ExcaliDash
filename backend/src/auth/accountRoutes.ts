import express, { Request, Response } from "express";
import type { Mailer } from "../mail/mailer";
import { PrismaClient } from "../generated/client";
import { registerAccountApiKeyRoutes } from "./accountApiKeyRoutes";
import { registerAccountPasswordChangeRoutes } from "./accountPasswordChangeRoutes";
import { registerAccountPasswordResetRoutes } from "./accountPasswordResetRoutes";
import { registerAccountPreferencesRoutes } from "./accountPreferencesRoutes";
import { registerAccountProfileRoutes } from "./accountProfileRoutes";

export type RegisterAccountRoutesDeps = {
  router: express.Router;
  prisma: PrismaClient;
  requireAuth: express.RequestHandler;
  loginAttemptRateLimiter: express.RequestHandler;
  accountActionRateLimiter: express.RequestHandler;
  ensureAuthEnabled: (res: Response) => Promise<boolean>;
  sanitizeText: (input: unknown, maxLength?: number) => string;
  /** Optional: without a configured provider no reset mail is sent. */
  mailer?: Mailer;
  config: {
    enablePasswordReset: boolean;
    enableAuditLogging: boolean;
    enableRefreshTokenRotation: boolean;
    nodeEnv: string;
    frontendUrl?: string;
  };
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
  setAuthCookies: (
    req: Request,
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
  ) => void;
  requireCsrf: (req: Request, res: Response) => boolean;
};

export const registerAccountRoutes = (deps: RegisterAccountRoutesDeps) => {
  registerAccountPasswordResetRoutes(deps);
  registerAccountPreferencesRoutes(deps);
  registerAccountProfileRoutes(deps);
  registerAccountApiKeyRoutes(deps);
  registerAccountPasswordChangeRoutes(deps);
};
