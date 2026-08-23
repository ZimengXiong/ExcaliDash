import { Request, Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { logAuditEvent } from "../utils/audit";
import { config as appConfig } from "../config";
import {
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from "./schemas";
import { canUseLocalPasswordFlows } from "./localPassword";
import { hashTokenForStorage } from "./tokenSecurity";
import type { RegisterAccountRoutesDeps } from "./accountRoutes";

export const registerAccountPasswordResetRoutes = (
  deps: RegisterAccountRoutesDeps,
) => {
  const {
    router,
    prisma,
    loginAttemptRateLimiter,
    ensureAuthEnabled,
    config,
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
          if (appConfig.isDev) {
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
};
