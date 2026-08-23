import bcrypt from "bcrypt";
import { Request, Response } from "express";
import { logAuditEvent } from "../utils/audit";
import { config as appConfig } from "../config";
import type { RegisterAdminRoutesDeps } from "./adminRoutes";

export const registerAdminUserPasswordRoutes = (deps: RegisterAdminRoutesDeps) => {
  const { router, prisma, requireAuth, accountActionRateLimiter, ensureAuthEnabled, requireAdmin, generateTempPassword, resetLoginAttemptKey, config, requireCsrf } = deps;
  router.post(
    "/users/:id/reset-password",
    requireAuth,
    accountActionRateLimiter,
    async (req: Request, res: Response) => {
      try {
        if (!(await ensureAuthEnabled(res))) return;
        if (!requireCsrf(req, res)) return;
        if (!requireAdmin(req, res)) return;
        if (req.user.impersonatorId) {
          return res
            .status(403)
            .json({
              error: "Forbidden",
              message: "Password resets are not allowed while impersonating",
            });
        }
        const userId = String(req.params.id || "").trim();
        if (!userId) {
          return res
            .status(400)
            .json({ error: "Bad request", message: "Invalid user id" });
        }
        if (userId === req.user.id) {
          return res
            .status(409)
            .json({
              error: "Conflict",
              message: "Use Profile -> Change Password for your own account",
            });
        }
        const target = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            username: true,
            role: true,
            isActive: true,
          },
        });
        if (!target) {
          return res
            .status(404)
            .json({ error: "Not found", message: "User not found" });
        }
        const tempPassword = generateTempPassword();
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(tempPassword, saltRounds);
        await prisma.user.update({
          where: { id: target.id },
          data: { passwordHash, mustResetPassword: true, isActive: true },
        });
        try {
          await prisma.refreshToken.updateMany({
            where: { userId: target.id, revoked: false },
            data: { revoked: true },
          });
        } catch {
          if (appConfig.isDev) {
            console.debug(
              "Refresh token revocation skipped (feature disabled or table missing)",
            );
          }
        }
        await resetLoginAttemptKey(target.email.toLowerCase());
        if (config.enableAuditLogging) {
          await logAuditEvent({
            userId: req.user.id,
            action: "admin_password_reset_generated",
            resource: `user:${target.id}`,
            ipAddress: req.ip || req.connection.remoteAddress || undefined,
            userAgent: req.headers["user-agent"] || undefined,
            details: { targetUserId: target.id, targetEmail: target.email },
          });
        }
        res.json({
          user: {
            id: target.id,
            email: target.email,
            username: target.username,
            role: target.role,
          },
          tempPassword,
        });
      } catch (error) {
        console.error("Reset password error:", error);
        res
          .status(500)
          .json({
            error: "Internal server error",
            message: "Failed to reset password",
          });
      }
    },
  );};
