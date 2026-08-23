import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { logAuditEvent } from "../utils/audit";
import { config as appConfig } from "../config";
import { changePasswordSchema, mustResetPasswordSchema } from "./schemas";
import { canUseLocalPasswordFlows } from "./localPassword";
import { hashTokenForStorage } from "./tokenSecurity";
import type { RegisterAccountRoutesDeps } from "./accountRoutes";

export const registerAccountPasswordChangeRoutes = (
  deps: RegisterAccountRoutesDeps,
) => {
  const {
    router,
    prisma,
    requireAuth,
    accountActionRateLimiter,
    ensureAuthEnabled,
    config,
    generateTokens,
    getRefreshTokenExpiresAt,
    setAuthCookies,
    requireCsrf,
  } = deps;
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
          if (appConfig.isDev) {
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
