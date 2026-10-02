import bcrypt from "bcrypt";
import { Request, Response } from "express";
import { Prisma } from "../generated/client";
import { logAuditEvent } from "../utils/audit";
import type { RegisterAdminRoutesDeps } from "./adminRoutes";
import { registerAdminUserPasswordRoutes } from "./adminUserPasswordRoutes";
import {
  adminCreateUserSchema,
  adminRoleUpdateSchema,
  adminUpdateUserSchema,
} from "./schemas";

export const registerAdminUserRoutes = (deps: RegisterAdminRoutesDeps) => {
  const {
    router,
    prisma,
    requireAuth,
    accountActionRateLimiter,
    ensureAuthEnabled,
    requireAdmin,
    findUserByIdentifier,
    countActiveAdmins,
    sanitizeText,
    config,
    requireCsrf,
  } = deps;
  router.post("/admins", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!(await ensureAuthEnabled(res))) return;
      if (!requireCsrf(req, res)) return;
      if (!requireAdmin(req, res)) return;
      const parsed = adminRoleUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Bad request",
          message: "Invalid admin update payload",
        });
      }
      const target = await findUserByIdentifier(parsed.data.identifier);
      if (!target) {
        return res
          .status(404)
          .json({ error: "Not found", message: "User not found" });
      }
      if (target.id === req.user.id && parsed.data.role !== "ADMIN") {
        return res.status(409).json({
          error: "Conflict",
          message: "You cannot change your own role from ADMIN",
        });
      }
      if (
        target.role === "ADMIN" &&
        parsed.data.role !== "ADMIN" &&
        target.isActive
      ) {
        const admins = await countActiveAdmins();
        if (admins <= 1) {
          return res.status(409).json({
            error: "Conflict",
            message: "There must be at least one active admin",
          });
        }
      }
      const updated = await prisma.user.update({
        where: { id: target.id },
        data: { role: parsed.data.role },
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
      res.json({ user: updated });
    } catch (error) {
      console.error("Admin role update error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to update user role",
      });
    }
  });
  router.get("/users", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!(await ensureAuthEnabled(res))) return;
      if (!requireAdmin(req, res)) return;
      const users = await prisma.user.findMany({
        orderBy: [{ createdAt: "asc" }],
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          role: true,
          mustResetPassword: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      res.json({ users });
    } catch (error) {
      console.error("List users error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to list users",
      });
    }
  });
  router.post(
    "/users",
    requireAuth,
    accountActionRateLimiter,
    async (req: Request, res: Response) => {
      try {
        if (!(await ensureAuthEnabled(res))) return;
        if (!requireCsrf(req, res)) return;
        if (!requireAdmin(req, res)) return;
        const parsed = adminCreateUserSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Validation error",
            message: "Invalid user payload",
          });
        }
        const {
          email,
          password,
          name,
          username,
          role,
          mustResetPassword,
          isActive,
          oidcOnly,
        } = parsed.data;
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
          return res.status(409).json({
            error: "Conflict",
            message: "User with this email already exists",
          });
        }
        if (username) {
          const existingUsername = await prisma.user.findFirst({
            where: { username },
            select: { id: true },
          });
          if (existingUsername) {
            return res.status(409).json({
              error: "Conflict",
              message: "User with this username already exists",
            });
          }
        }
        if (oidcOnly && !config.oidc.enabled) {
          return res.status(409).json({
            error: "Conflict",
            message: "OIDC-only invited users require OIDC to be enabled.",
          });
        }
        const passwordHash =
          oidcOnly || !password ? "" : await bcrypt.hash(password, 10);
        const sanitizedName = sanitizeText(name, 100);
        const user = await prisma.user.create({
          data: {
            email,
            username: username ?? null,
            passwordHash,
            name: sanitizedName,
            role: role ?? "USER",
            mustResetPassword: oidcOnly ? false : (mustResetPassword ?? false),
            isActive: isActive ?? true,
          },
          select: {
            id: true,
            username: true,
            email: true,
            name: true,
            role: true,
            mustResetPassword: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        if (config.enableAuditLogging) {
          await logAuditEvent({
            userId: req.user.id,
            action: "admin_user_created",
            resource: `user:${user.id}`,
            ipAddress: req.ip || req.connection.remoteAddress || undefined,
            userAgent: req.headers["user-agent"] || undefined,
            details: { createdUserId: user.id },
          });
        }
        res.status(201).json({ user });
      } catch (error) {
        console.error("Create user error:", error);
        res.status(500).json({
          error: "Internal server error",
          message: "Failed to create user",
        });
      }
    },
  );
  router.patch(
    "/users/:id",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        if (!(await ensureAuthEnabled(res))) return;
        if (!requireCsrf(req, res)) return;
        if (!requireAdmin(req, res)) return;
        const userId = String(req.params.id || "").trim();
        if (!userId) {
          return res
            .status(400)
            .json({ error: "Bad request", message: "Invalid user id" });
        }
        const parsed = adminUpdateUserSchema.safeParse(req.body);
        if (!parsed.success) {
          return res
            .status(400)
            .json({ error: "Bad request", message: "Invalid update payload" });
        }
        if (userId === req.user.id && parsed.data.isActive === false) {
          return res.status(409).json({
            error: "Conflict",
            message: "You cannot deactivate your own account",
          });
        }
        if (
          userId === req.user.id &&
          parsed.data.role &&
          parsed.data.role !== "ADMIN"
        ) {
          return res.status(409).json({
            error: "Conflict",
            message: "You cannot change your own role from ADMIN",
          });
        }
        const current = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, role: true, isActive: true },
        });
        if (!current) {
          return res
            .status(404)
            .json({ error: "Not found", message: "User not found" });
        }
        const nextRole =
          typeof parsed.data.role === "undefined"
            ? current.role
            : parsed.data.role;
        const nextActive =
          typeof parsed.data.isActive === "undefined"
            ? current.isActive
            : parsed.data.isActive;
        const removingAdmin =
          current.role === "ADMIN" &&
          current.isActive &&
          (nextRole !== "ADMIN" || nextActive === false);
        if (removingAdmin) {
          const admins = await countActiveAdmins();
          if (admins <= 1) {
            return res.status(409).json({
              error: "Conflict",
              message: "There must be at least one active admin",
            });
          }
        }
        const data: Record<string, unknown> = {};
        if (typeof parsed.data.username !== "undefined")
          data.username = parsed.data.username;
        if (typeof parsed.data.name !== "undefined")
          data.name = sanitizeText(parsed.data.name, 100);
        if (typeof parsed.data.role !== "undefined")
          data.role = parsed.data.role;
        if (typeof parsed.data.mustResetPassword !== "undefined")
          data.mustResetPassword = parsed.data.mustResetPassword;
        if (typeof parsed.data.isActive !== "undefined")
          data.isActive = parsed.data.isActive;
        const updated = await prisma.user.update({
          where: { id: userId },
          data,
          select: {
            id: true,
            username: true,
            email: true,
            name: true,
            role: true,
            mustResetPassword: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        if (config.enableAuditLogging) {
          await logAuditEvent({
            userId: req.user.id,
            action: "admin_user_updated",
            resource: `user:${updated.id}`,
            ipAddress: req.ip || req.connection.remoteAddress || undefined,
            userAgent: req.headers["user-agent"] || undefined,
            details: { updatedUserId: updated.id, fields: Object.keys(data) },
          });
        }
        res.json({ user: updated });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return res.status(409).json({
            error: "Conflict",
            message: "User with this username already exists",
          });
        }
        console.error("Update user error:", error);
        res.status(500).json({
          error: "Internal server error",
          message: "Failed to update user",
        });
      }
    },
  );
  registerAdminUserPasswordRoutes(deps);
};
