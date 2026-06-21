import express, { Request, Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { PrismaClient } from "../generated/client";
import { logAuditEvent } from "../utils/audit";
import {
  changePasswordSchema,
  mustResetPasswordSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  updateEmailSchema,
  updateProfileSchema,
} from "./schemas";
import { canUseLocalPasswordFlows } from "./localPassword";
import { hashTokenForStorage } from "./tokenSecurity";

type RegisterAccountRoutesDeps = {
  router: express.Router;
  prisma: PrismaClient;
  requireAuth: express.RequestHandler;
  loginAttemptRateLimiter: express.RequestHandler;
  accountActionRateLimiter: express.RequestHandler;
  ensureAuthEnabled: (res: Response) => Promise<boolean>;
  sanitizeText: (input: unknown, maxLength?: number) => string;
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
    }
  ) => { accessToken: string; refreshToken: string };
  getRefreshTokenExpiresAt: () => Date;
  setAuthCookies: (
    req: Request,
    res: Response,
    tokens: { accessToken: string; refreshToken: string }
  ) => void;
  requireCsrf: (req: Request, res: Response) => boolean;
};

export const registerAccountRoutes = (deps: RegisterAccountRoutesDeps) => {
  const {
    router,
    prisma,
    requireAuth,
    loginAttemptRateLimiter,
    accountActionRateLimiter,
    ensureAuthEnabled,
    sanitizeText,
    config,
    generateTokens,
    getRefreshTokenExpiresAt,
    setAuthCookies,
    requireCsrf,
  } = deps;

  router.post("/password-reset-request", loginAttemptRateLimiter, async (req: Request, res: Response) => {
    if (!(await ensureAuthEnabled(res))) return;
    if (!config.enablePasswordReset) {
      return res.status(404).json({
        error: "Not found",
        message: "Password reset feature is not enabled",
      });
    }

    try {
      const parsed = passwordResetRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation error",
          message: "Invalid email address",
        });
      }

      const { email } = parsed.data;
      const user = await prisma.user.findUnique({ where: { email } });

      if (user && user.isActive && canUseLocalPasswordFlows(user)) {
        const resetToken = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1);

        await prisma.passwordResetToken.updateMany({
          where: { userId: user.id, used: false },
          data: { used: true },
        });

        await prisma.passwordResetToken.create({
          data: { userId: user.id, token: hashTokenForStorage(resetToken), expiresAt },
        });

        if (config.enableAuditLogging) {
          await logAuditEvent({
            userId: user.id,
            action: "password_reset_requested",
            ipAddress: req.ip || req.connection.remoteAddress || undefined,
            userAgent: req.headers["user-agent"] || undefined,
          });
        }

        if (config.nodeEnv === "development") {
          console.log(`[DEV] Password reset token for ${email}: ${resetToken}`);
          const baseUrlRaw = config.frontendUrl?.split(",")[0]?.trim();
          const baseUrlWithProtocol = baseUrlRaw
            ? /^https?:\/\//i.test(baseUrlRaw)
              ? baseUrlRaw
              : `http://${baseUrlRaw}`
            : "http://localhost:6767";
          const baseUrl = baseUrlWithProtocol.replace(/\/$/, "");
          console.log(`[DEV] Reset URL: ${baseUrl}/reset-password-confirm?token=${resetToken}`);
        }
      }

      return res.json({
        message: "If an account with that email exists, a password reset link has been sent.",
      });
    } catch (error) {
      console.error("Password reset request error:", error);
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to process password reset request",
      });
    }
  });

  router.post("/password-reset-confirm", loginAttemptRateLimiter, async (req: Request, res: Response) => {
    if (!(await ensureAuthEnabled(res))) return;
    if (!config.enablePasswordReset) {
      return res.status(404).json({
        error: "Not found",
        message: "Password reset feature is not enabled",
      });
    }

    try {
      const parsed = passwordResetConfirmSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation error",
          message: "Invalid reset data",
        });
      }

      const { token, password } = parsed.data;
      const resetToken = await prisma.passwordResetToken.findFirst({
        where: {
          token: hashTokenForStorage(token),
        },
        include: { user: true },
      });

      if (!resetToken || resetToken.used) {
        return res.status(400).json({
          error: "Invalid token",
          message: "Password reset token is invalid or has already been used",
        });
      }
      if (new Date() > resetToken.expiresAt) {
        return res.status(400).json({
          error: "Expired token",
          message: "Password reset token has expired",
        });
      }
      if (!resetToken.user.isActive) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Account is inactive",
        });
      }
      if (!canUseLocalPasswordFlows(resetToken.user)) {
        await prisma.passwordResetToken.update({
          where: { id: resetToken.id },
          data: { used: true },
        });
        return res.status(400).json({
          error: "Bad request",
          message: "Password reset is not available for this account",
        });
      }

      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      await prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash, mustResetPassword: false },
      });
      await prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      });

      if (config.enableRefreshTokenRotation) {
        try {
          await prisma.refreshToken.updateMany({
            where: { userId: resetToken.userId, revoked: false },
            data: { revoked: true },
          });
        } catch {
          if (process.env.NODE_ENV === "development") {
            console.debug("Refresh token revocation skipped (feature disabled or table missing)");
          }
        }
      }

      if (config.enableAuditLogging) {
        await logAuditEvent({
          userId: resetToken.userId,
          action: "password_changed",
          ipAddress: req.ip || req.connection.remoteAddress || undefined,
          userAgent: req.headers["user-agent"] || undefined,
        });
      }

      return res.json({ message: "Password has been reset successfully" });
    } catch (error) {
      console.error("Password reset confirm error:", error);
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to reset password",
      });
    }
  });

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
          if (process.env.NODE_ENV === "development") {
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
          if (process.env.NODE_ENV === "development") {
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

  router.post("/change-password", requireAuth, accountActionRateLimiter, async (req: Request, res: Response) => {
    try {
      if (!(await ensureAuthEnabled(res))) return;
      if (!requireCsrf(req, res)) return;
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized", message: "User not authenticated" });
      }
      if (req.user.impersonatorId) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Password changes are not allowed while impersonating",
        });
      }

      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation error",
          message: "Invalid password data",
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { id: true, passwordHash: true, isActive: true },
      });
      if (!user || !user.isActive) {
        return res.status(404).json({ error: "Not found", message: "User not found" });
      }

      // OIDC-provisioned users may not have a usable local password hash until they set/reset one.
      if (!canUseLocalPasswordFlows(user)) {
        return res.status(400).json({
          error: "Bad request",
          message: "Cannot change password for this account",
        });
      }

      const passwordValid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
      if (!passwordValid) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "Current password is incorrect",
        });
      }

      const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, mustResetPassword: false },
      });

      if (config.enableRefreshTokenRotation) {
        try {
          await prisma.refreshToken.updateMany({
            where: { userId: user.id, revoked: false },
            data: { revoked: true },
          });
        } catch {
          if (process.env.NODE_ENV === "development") {
            console.debug("Refresh token revocation skipped (feature disabled or table missing)");
          }
        }
      }

      if (config.enableAuditLogging) {
        await logAuditEvent({
          userId: user.id,
          action: "password_changed",
          ipAddress: req.ip || req.connection.remoteAddress || undefined,
          userAgent: req.headers["user-agent"] || undefined,
          details: { method: "change_password" },
        });
      }

      return res.json({ message: "Password changed successfully" });
    } catch (error) {
      console.error("Change password error:", error);
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to change password",
      });
    }
  });

  router.post("/must-reset-password", requireAuth, accountActionRateLimiter, async (req: Request, res: Response) => {
    try {
      if (!(await ensureAuthEnabled(res))) return;
      if (!requireCsrf(req, res)) return;
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized", message: "User not authenticated" });
      }
      if (req.user.impersonatorId) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Password changes are not allowed while impersonating",
        });
      }

      const parsed = mustResetPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation error",
          message: "Invalid password data",
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { id: true, email: true, isActive: true, mustResetPassword: true },
      });
      if (!user || !user.isActive) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "User account not found or inactive",
        });
      }
      if (!user.mustResetPassword) {
        return res.status(409).json({
          error: "Conflict",
          message: "Password reset is not required for this account",
        });
      }

      const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, mustResetPassword: false },
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
          if (process.env.NODE_ENV === "development") {
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
          if (process.env.NODE_ENV === "development") {
            console.debug("Refresh token storage skipped (feature disabled or table missing)");
          }
        }
      }

      if (config.enableAuditLogging) {
        await logAuditEvent({
          userId: updatedUser.id,
          action: "password_reset_required_completed",
          ipAddress: req.ip || req.connection.remoteAddress || undefined,
          userAgent: req.headers["user-agent"] || undefined,
        });
      }

      return res.json({ user: updatedUser });
    } catch (error) {
      console.error("Must reset password error:", error);
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to reset password",
      });
    }
  });
};
