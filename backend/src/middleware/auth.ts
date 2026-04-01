import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { PrismaClient } from "../generated/client";
import { prisma as defaultPrisma } from "../db/prisma";
import { createAuthModeService, type AuthModeService } from "../auth/authMode";
import {
  ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
  readCookie,
} from "../auth/cookies";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username?: string | null;
        email: string;
        name: string;
        role: string;
        mustResetPassword?: boolean;
        impersonatorId?: string;
      };
      principal?: {
        kind: "user";
        userId: string;
      };
      authError?: {
        code: "INVALID_ACCESS_TOKEN" | "ACCESS_TOKEN_MISSING";
      };
    }
  }
}

interface JwtPayload {
  userId: string;
  email: string;
  type: "access" | "refresh";
  impersonatorId?: string;
}

const isJwtPayload = (decoded: unknown): decoded is JwtPayload => {
  if (typeof decoded !== "object" || decoded === null) {
    return false;
  }
  const payload = decoded as Record<string, unknown>;
  const impersonatorOk =
    typeof payload.impersonatorId === "undefined" || typeof payload.impersonatorId === "string";
  return (
    typeof payload.userId === "string" &&
    typeof payload.email === "string" &&
    (payload.type === "access" || payload.type === "refresh") &&
    impersonatorOk
  );
};

const extractToken = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === "string") {
    const parts = authHeader.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      return parts[1] || null;
    }
  }

  return readCookie(req, ACCESS_TOKEN_COOKIE_NAME);
};

const hasRefreshTokenCookie = (req: Request): boolean =>
  readCookie(req, REFRESH_TOKEN_COOKIE_NAME) !== null;

const verifyToken = (token: string): JwtPayload | null => {
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (!isJwtPayload(decoded)) {
      return null;
    }
    if (decoded.type !== "access") {
      return null; // Only accept access tokens in middleware
    }
    return decoded;
  } catch {
    return null;
  }
};

const normalizeRequestPath = (req: Request): string => {
  const raw = (req.originalUrl || req.url || "").split("?")[0] || "";
  return raw.replace(/^\/api(?=\/)/, "");
};

const isAllowedWhileMustResetPassword = (req: Request): boolean => {
  const path = normalizeRequestPath(req);

  if (req.method === "GET" && path === "/auth/me") return true;
  if (req.method === "POST" && path === "/auth/change-password") return true;
  if (req.method === "POST" && path === "/auth/must-reset-password") return true;

  return false;
};

export type AuthMiddlewareDeps = {
  prisma: PrismaClient;
  authModeService: AuthModeService;
};

export const createAuthMiddleware = ({
  prisma,
  authModeService,
}: AuthMiddlewareDeps) => {
  const requireAuth = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const authEnabled = await authModeService.getAuthEnabled();
      if (!authEnabled) {
        const user = await authModeService.getBootstrapActingUser();
        req.user = {
          id: user.id,
          username: user.username,
          email: user.email,
          name: user.name,
          role: user.role,
          mustResetPassword: user.mustResetPassword,
        };
        return next();
      }
    } catch (error) {
      console.error("Error reading auth mode:", error);
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to read authentication mode",
      });
      return;
    }

    const token = extractToken(req);

    if (!token) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Authentication token required",
      });
      return;
    }

    const payload = verifyToken(token);

    if (!payload) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Invalid or expired token",
      });
      return;
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          role: true,
          mustResetPassword: true,
          isActive: true,
        },
      });

      if (!user || !user.isActive) {
        res.status(401).json({
          error: "Unauthorized",
          message: "User account not found or inactive",
        });
        return;
      }

      if (user.mustResetPassword && !isAllowedWhileMustResetPassword(req)) {
        res.status(403).json({
          error: "Forbidden",
          code: "MUST_RESET_PASSWORD",
          message: "You must reset your password before using the app",
        });
        return;
      }

      req.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        mustResetPassword: user.mustResetPassword,
        impersonatorId: payload.impersonatorId,
      };

      next();
    } catch (error) {
      console.error("Error verifying user:", error);
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to verify user",
      });
    }
  };

  const optionalAuth = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const authEnabled = await authModeService.getAuthEnabled();
      if (!authEnabled) {
        // Keep optionalAuth behavior consistent with requireAuth when auth is disabled:
        // attach the bootstrap acting user so downstream routes can authorize ownership correctly.
        const user = await authModeService.getBootstrapActingUser();
        req.user = {
          id: user.id,
          username: user.username,
          email: user.email,
          name: user.name,
          role: user.role,
          mustResetPassword: user.mustResetPassword,
        };
        return next();
      }
    } catch (error) {
      console.error("Error reading auth mode:", error);
      return next();
    }

    const token = extractToken(req);

    if (!token) {
      if (hasRefreshTokenCookie(req)) {
        req.authError = { code: "ACCESS_TOKEN_MISSING" };
        return next();
      }
      return next();
    }

    const payload = verifyToken(token);

    if (!payload) {
      req.authError = { code: "INVALID_ACCESS_TOKEN" };
      return next();
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          role: true,
          mustResetPassword: true,
          isActive: true,
        },
      });

      if (user && user.isActive) {
        req.user = {
          id: user.id,
          username: user.username,
          email: user.email,
          name: user.name,
          role: user.role,
          mustResetPassword: user.mustResetPassword,
          impersonatorId: payload.impersonatorId,
        };
      }
    } catch (error) {
      console.error("Error in optional auth:", error);
    }

    next();
  };

  return {
    requireAuth,
    optionalAuth,
  };
};

const defaultAuthModeService = createAuthModeService(defaultPrisma);
const defaultAuthMiddleware = createAuthMiddleware({
  prisma: defaultPrisma,
  authModeService: defaultAuthModeService,
});

export const authModeService = defaultAuthModeService;
export const requireAuth = defaultAuthMiddleware.requireAuth;
export const optionalAuth = defaultAuthMiddleware.optionalAuth;
