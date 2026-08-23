import { Request, Response } from "express";
import { logAuditEvent } from "../utils/audit";
import { config as appConfig } from "../config";
import type { RegisterAdminRoutesDeps } from "./adminRoutes";
import { impersonateSchema } from "./schemas";
import { hashTokenForStorage } from "./tokenSecurity";

export const registerAdminImpersonationRoutes = (deps: RegisterAdminRoutesDeps) => {
  const { router, prisma, requireAuth, accountActionRateLimiter, ensureAuthEnabled, findUserByIdentifier, generateTokens, getRefreshTokenExpiresAt, config, setAuthCookies, requireCsrf } = deps;
  const resolveImpersonationAdmin = async (req: Request, res: Response) => {
    if (!req.user) {
      res
        .status(401)
        .json({ error: "Unauthorized", message: "User not authenticated" });
      return null;
    }
    if (req.user.role === "ADMIN") {
      return { id: req.user.id, email: req.user.email, name: req.user.name };
    }
    if (!req.user.impersonatorId) {
      res
        .status(403)
        .json({ error: "Forbidden", message: "Admin access required" });
      return null;
    }
    const impersonator = await prisma.user.findUnique({
      where: { id: req.user.impersonatorId },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
    if (
      !impersonator ||
      !impersonator.isActive ||
      impersonator.role !== "ADMIN"
    ) {
      res
        .status(403)
        .json({ error: "Forbidden", message: "Admin access required" });
      return null;
    }
    return {
      id: impersonator.id,
      email: impersonator.email,
      name: impersonator.name,
    };
  };
  router.get(
    "/impersonation-targets",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        if (!(await ensureAuthEnabled(res))) return;
        const actingAdmin = await resolveImpersonationAdmin(req, res);
        if (!actingAdmin) return;
        const users = await prisma.user.findMany({
          where: { isActive: true, id: { not: actingAdmin.id } },
          orderBy: [{ name: "asc" }, { email: "asc" }],
          select: {
            id: true,
            username: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
          },
        });
        res.json({
          users,
          impersonator: {
            id: actingAdmin.id,
            email: actingAdmin.email,
            name: actingAdmin.name,
          },
        });
      } catch (error) {
        console.error("List impersonation targets error:", error);
        res
          .status(500)
          .json({
            error: "Internal server error",
            message: "Failed to list impersonation targets",
          });
      }
    },
  );
  router.post(
    "/impersonate",
    requireAuth,
    accountActionRateLimiter,
    async (req: Request, res: Response) => {
      try {
        if (!(await ensureAuthEnabled(res))) return;
        if (!requireCsrf(req, res)) return;
        const actingAdmin = await resolveImpersonationAdmin(req, res);
        if (!actingAdmin) return;
        const parsed = impersonateSchema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(400)
            .json({
              error: "Bad request",
              message: "Invalid impersonation payload",
            });
        }
        const target = parsed.data.userId
          ? await prisma.user.findUnique({ where: { id: parsed.data.userId } })
          : await findUserByIdentifier(parsed.data.identifier || "");
        if (!target) {
          return res
            .status(404)
            .json({ error: "Not found", message: "User not found" });
        }
        if (target.id === actingAdmin.id) {
          return res
            .status(409)
            .json({
              error: "Conflict",
              message:
                "Already using the admin account. Use stop impersonation to return.",
            });
        }
        if (!target.isActive) {
          return res
            .status(403)
            .json({ error: "Forbidden", message: "Target user is inactive" });
        }
        const { accessToken, refreshToken } = generateTokens(
          target.id,
          target.email,
          { impersonatorId: actingAdmin.id },
        );
        setAuthCookies(req, res, { accessToken, refreshToken });
        if (config.enableRefreshTokenRotation) {
          const expiresAt = getRefreshTokenExpiresAt();
          try {
            await prisma.refreshToken.create({
              data: {
                userId: target.id,
                token: hashTokenForStorage(refreshToken),
                expiresAt,
              },
            });
          } catch {
            if (appConfig.isDev) {
              console.debug(
                "Refresh token storage skipped (feature disabled or table missing)",
              );
            }
          }
        }
        if (config.enableAuditLogging) {
          await logAuditEvent({
            userId: actingAdmin.id,
            action: "impersonation_started",
            resource: `user:${target.id}`,
            ipAddress: req.ip || req.connection.remoteAddress || undefined,
            userAgent: req.headers["user-agent"] || undefined,
            details: {
              targetUserId: target.id,
              initiatedFromImpersonation: Boolean(req.user?.impersonatorId),
            },
          });
        }
        res.json({
          user: {
            id: target.id,
            username: target.username ?? null,
            email: target.email,
            name: target.name,
            role: target.role,
            mustResetPassword: target.mustResetPassword,
          },
        });
      } catch (error) {
        console.error("Impersonation error:", error);
        res
          .status(500)
          .json({
            error: "Internal server error",
            message: "Failed to impersonate user",
          });
      }
    },
  );};
