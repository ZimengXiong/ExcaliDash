import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { logAuditEvent } from "../utils/audit";
import { config as appConfig } from "../config";
import { updateEmailSchema, updateProfileSchema } from "./schemas";
import { canUseLocalPasswordFlows } from "./localPassword";
import { hashTokenForStorage } from "./tokenSecurity";
import type { RegisterAccountRoutesDeps } from "./accountRoutes";

export const registerAccountProfileRoutes = (
  deps: RegisterAccountRoutesDeps,
) => {
  const {
    router,
    prisma,
    requireAuth,
    accountActionRateLimiter,
    ensureAuthEnabled,
    sanitizeText,
    config,
    generateTokens,
    getRefreshTokenExpiresAt,
    setAuthCookies,
    requireCsrf,
  } = deps;
  router.put("/profile", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!(await ensureAuthEnabled(res))) return;
      if (!requireCsrf(req, res)) return;
      if (!req.user) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "User not authenticated",
        });
      }
      if (req.user.impersonatorId) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Profile updates are not allowed while impersonating",
        });
      }

      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation error",
          message: "Invalid name format",
        });
      }

      const sanitizedName = sanitizeText(parsed.data.name, 100);
      const updatedUser = await prisma.user.update({
        where: { id: req.user.id },
        data: { name: sanitizedName },
        select: { id: true, email: true, name: true, createdAt: true, updatedAt: true },
      });

      if (config.enableAuditLogging) {
        await logAuditEvent({
          userId: req.user.id,
          action: "profile_updated",
          ipAddress: req.ip || req.connection.remoteAddress || undefined,
          userAgent: req.headers["user-agent"] || undefined,
          details: { field: "name" },
        });
      }

      return res.json({ user: updatedUser });
    } catch (error) {
      console.error("Update profile error:", error);
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to update profile",
      });
    }
  });

  router.put("/email", requireAuth, accountActionRateLimiter, async (req: Request, res: Response) => {
    try {
      if (!(await ensureAuthEnabled(res))) return;
      if (!requireCsrf(req, res)) return;
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized", message: "User not authenticated" });
      }
      if (req.user.impersonatorId) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Email changes are not allowed while impersonating",
        });
      }

      const parsed = updateEmailSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation error",
          message: "Invalid email update data",
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { id: true, email: true, passwordHash: true, isActive: true },
      });
      if (!user || !user.isActive) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "User account not found or inactive",
        });
      }
      if (!canUseLocalPasswordFlows(user)) {
        return res.status(400).json({
          error: "Bad request",
          message: "Cannot change email for this account",
        });
      }

      const passwordValid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
      if (!passwordValid) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "Current password is incorrect",
        });
      }

      if (parsed.data.email !== user.email) {
        const existingUser = await prisma.user.findUnique({
          where: { email: parsed.data.email },
          select: { id: true },
        });
        if (existingUser && existingUser.id !== user.id) {
          return res.status(409).json({
            error: "Conflict",
            message: "User with this email already exists",
          });
        }
      }

      const previousEmail = user.email;
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { email: parsed.data.email },
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          role: true,
          mustResetPassword: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (config.enableRefreshTokenRotation) {
        try {
          await prisma.refreshToken.updateMany({
            where: { userId: updatedUser.id, revoked: false },
            data: { revoked: true },
          });
        } catch {
          if (appConfig.isDev) {
            console.debug("Refresh token revocation skipped (feature disabled or table missing)");
          }
        }
      }

      const { accessToken, refreshToken } = generateTokens(updatedUser.id, updatedUser.email);
      setAuthCookies(req, res, { accessToken, refreshToken });
      if (config.enableRefreshTokenRotation) {
        const expiresAt = getRefreshTokenExpiresAt();
        try {
          await prisma.refreshToken.create({
            data: {
              userId: updatedUser.id,
              token: hashTokenForStorage(refreshToken),
              expiresAt,
            },
          });
        } catch {
          if (appConfig.isDev) {
            console.debug("Refresh token storage skipped (feature disabled or table missing)");
          }
        }
      }

      if (config.enableAuditLogging) {
        await logAuditEvent({
          userId: updatedUser.id,
          action: "email_updated",
          ipAddress: req.ip || req.connection.remoteAddress || undefined,
          userAgent: req.headers["user-agent"] || undefined,
          details: { previousEmail, newEmail: updatedUser.email },
        });
      }

      return res.json({ user: updatedUser });
    } catch (error) {
      console.error("Update email error:", error);
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to update email",
      });
    }
  });
};
