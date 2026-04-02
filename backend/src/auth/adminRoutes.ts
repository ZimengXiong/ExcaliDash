import bcrypt from "bcrypt";
import express, { Request, Response } from "express";
import { Prisma, PrismaClient } from "../generated/client";
import { logAuditEvent } from "../utils/audit";
import {
  adminCreateUserSchema,
  adminRoleUpdateSchema,
  adminUpdateUserSchema,
  impersonateSchema,
  loginRateLimitResetSchema,
  loginRateLimitUpdateSchema,
  oidcJitProvisioningToggleSchema,
  registrationToggleSchema,
} from "./schemas";
import { hashTokenForStorage } from "./tokenSecurity";

type RegisterAdminRoutesDeps = {
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
    res: Response
  ) => req is Request & { user: NonNullable<Request["user"]> };
  findUserByIdentifier: (identifier: string) => Promise<{
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
    options?: { impersonatorId?: string }
  ) => { accessToken: string; refreshToken: string };
  getRefreshTokenExpiresAt: () => Date;
  config: {
    authMode: "local" | "hybrid" | "oidc_enforced";
    enableAuditLogging: boolean;
    enableRefreshTokenRotation: boolean;
    oidc: {
      enabled: boolean;
      providerName: string;
      jitProvisioning: boolean;
    };
  };
  defaultSystemConfigId: string;
  setAuthCookies: (
    req: Request,
    res: Response,
    tokens: { accessToken: string; refreshToken: string }
  ) => void;
  requireCsrf: (req: Request, res: Response) => boolean;
};

export const registerAdminRoutes = (deps: RegisterAdminRoutesDeps) => {
  const {
    router,
    prisma,
    requireAuth,
    accountActionRateLimiter,
    ensureAuthEnabled,
    ensureSystemConfig,
    parseLoginRateLimitConfig,
    applyLoginRateLimitConfig,
    resetLoginAttemptKey,
    requireAdmin,
    findUserByIdentifier,
    countActiveAdmins,
    sanitizeText,
    generateTempPassword,
    generateTokens,
    getRefreshTokenExpiresAt,
    config,
    defaultSystemConfigId,
    setAuthCookies,
    requireCsrf,
  } = deps;

  const getEffectiveOidcJitProvisioning = (systemConfig: {
    oidcJitProvisioningEnabled: boolean | null;
  }): boolean =>
    config.oidc.enabled
      ? typeof systemConfig.oidcJitProvisioningEnabled === "boolean"
        ? systemConfig.oidcJitProvisioningEnabled
        : config.oidc.jitProvisioning
      : false;

  const resolveImpersonationAdmin = async (req: Request, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized", message: "User not authenticated" });
      return null;
    }

    if (req.user.role === "ADMIN") {
      return {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
      };
    }

    if (!req.user.impersonatorId) {
      res.status(403).json({ error: "Forbidden", message: "Admin access required" });
      return null;
    }

    const impersonator = await prisma.user.findUnique({
      where: { id: req.user.impersonatorId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
      },
    });

    if (!impersonator || !impersonator.isActive || impersonator.role !== "ADMIN") {
      res.status(403).json({ error: "Forbidden", message: "Admin access required" });
      return null;
    }

    return {
      id: impersonator.id,
      email: impersonator.email,
      name: impersonator.name,
    };
  };

  router.post("/registration/toggle", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!(await ensureAuthEnabled(res))) return;
      if (!requireCsrf(req, res)) return;
      if (!requireAdmin(req, res)) return;
      if (config.authMode === "oidc_enforced") {
        return res.status(409).json({
          error: "Conflict",
          message:
            "Local self-sign-up is unavailable in OIDC enforced mode. Use invited users and the OIDC auto-provisioning setting instead.",
        });
      }

      const parsed = registrationToggleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Bad request", message: "Invalid toggle payload" });
      }

      const updated = await prisma.systemConfig.upsert({
        where: { id: defaultSystemConfigId },
        update: { registrationEnabled: parsed.data.enabled },
        create: { id: defaultSystemConfigId, registrationEnabled: parsed.data.enabled },
      });

      res.json({ registrationEnabled: updated.registrationEnabled });
    } catch (error) {
      console.error("Registration toggle error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to update registration setting",
      });
    }
  });

  router.post("/oidc/jit-provisioning", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!(await ensureAuthEnabled(res))) return;
      if (!requireCsrf(req, res)) return;
      if (!requireAdmin(req, res)) return;

      if (!config.oidc.enabled) {
        return res.status(409).json({
          error: "Conflict",
          message: "OIDC is not enabled.",
        });
      }

      const parsed = oidcJitProvisioningToggleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Bad request", message: "Invalid OIDC provisioning payload" });
      }

      const updated = await prisma.systemConfig.upsert({
        where: { id: defaultSystemConfigId },
        update: { oidcJitProvisioningEnabled: parsed.data.enabled },
        create: {
          id: defaultSystemConfigId,
          oidcJitProvisioningEnabled: parsed.data.enabled,
        },
      });

      res.json({
        oidcJitProvisioningEnabled: getEffectiveOidcJitProvisioning(updated),
      });
    } catch (error) {
      console.error("OIDC JIT provisioning toggle error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to update OIDC provisioning setting",
      });
    }
  });

  router.post("/admins", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!(await ensureAuthEnabled(res))) return;
      if (!requireCsrf(req, res)) return;
      if (!requireAdmin(req, res)) return;

      const parsed = adminRoleUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Bad request", message: "Invalid admin update payload" });
      }

      const target = await findUserByIdentifier(parsed.data.identifier);
      if (!target) {
        return res.status(404).json({ error: "Not found", message: "User not found" });
      }

      if (target.id === req.user.id && parsed.data.role !== "ADMIN") {
        return res.status(409).json({
          error: "Conflict",
          message: "You cannot change your own role from ADMIN",
        });
      }

      if (target.role === "ADMIN" && parsed.data.role !== "ADMIN" && target.isActive) {
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

  router.get("/impersonation-targets", requireAuth, async (req: Request, res: Response) => {
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
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to list impersonation targets",
      });
    }
  });

  router.get("/rate-limit/login", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!(await ensureAuthEnabled(res))) return;
      if (!requireAdmin(req, res)) return;

      const systemConfig = await ensureSystemConfig();
      const cfg = parseLoginRateLimitConfig(systemConfig);
      res.json({ config: cfg });
    } catch (error) {
      console.error("Get login rate limit config error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to fetch login rate limit config",
      });
    }
  });

  router.put("/rate-limit/login", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!(await ensureAuthEnabled(res))) return;
      if (!requireCsrf(req, res)) return;
      if (!requireAdmin(req, res)) return;

      const parsed = loginRateLimitUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation error",
          message: "Invalid rate limit config",
        });
      }

      const updated = await prisma.systemConfig.update({
        where: { id: defaultSystemConfigId },
        data: {
          authLoginRateLimitEnabled: parsed.data.enabled,
          authLoginRateLimitWindowMs: parsed.data.windowMs,
          authLoginRateLimitMax: parsed.data.max,
        },
      });

      const nextConfig = applyLoginRateLimitConfig(updated);

      if (config.enableAuditLogging) {
        await logAuditEvent({
          userId: req.user.id,
          action: "admin_login_rate_limit_updated",
          resource: "system_config",
          ipAddress: req.ip || req.connection.remoteAddress || undefined,
          userAgent: req.headers["user-agent"] || undefined,
          details: { ...nextConfig },
        });
      }

      res.json({ config: nextConfig });
    } catch (error) {
      console.error("Update login rate limit config error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to update login rate limit config",
      });
    }
  });

  router.post("/rate-limit/login/reset", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!(await ensureAuthEnabled(res))) return;
      if (!requireCsrf(req, res)) return;
      if (!requireAdmin(req, res)) return;

      const parsed = loginRateLimitResetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation error",
          message: "Invalid reset payload",
        });
      }

      const identifier = parsed.data.identifier.trim().toLowerCase();
      await resetLoginAttemptKey(identifier);

      if (config.enableAuditLogging) {
        await logAuditEvent({
          userId: req.user.id,
          action: "admin_login_rate_limit_reset",
          resource: `rate_limit:login:${identifier}`,
          ipAddress: req.ip || req.connection.remoteAddress || undefined,
          userAgent: req.headers["user-agent"] || undefined,
          details: { identifier },
        });
      }

      res.json({ ok: true });
    } catch (error) {
      console.error("Reset login rate limit error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to reset login rate limit",
      });
    }
  });

  router.post("/users", requireAuth, accountActionRateLimiter, async (req: Request, res: Response) => {
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

      const { email, password, name, username, role, mustResetPassword, isActive, oidcOnly } =
        parsed.data;

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
          mustResetPassword: oidcOnly ? false : mustResetPassword ?? false,
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
  });

  router.patch("/users/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!(await ensureAuthEnabled(res))) return;
      if (!requireCsrf(req, res)) return;
      if (!requireAdmin(req, res)) return;

      const userId = String(req.params.id || "").trim();
      if (!userId) {
        return res.status(400).json({ error: "Bad request", message: "Invalid user id" });
      }

      const parsed = adminUpdateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Bad request", message: "Invalid update payload" });
      }

      if (userId === req.user.id && parsed.data.isActive === false) {
        return res.status(409).json({
          error: "Conflict",
          message: "You cannot deactivate your own account",
        });
      }

      if (userId === req.user.id && parsed.data.role && parsed.data.role !== "ADMIN") {
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
        return res.status(404).json({ error: "Not found", message: "User not found" });
      }

      const nextRole = typeof parsed.data.role === "undefined" ? current.role : parsed.data.role;
      const nextActive =
        typeof parsed.data.isActive === "undefined" ? current.isActive : parsed.data.isActive;

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
      if (typeof parsed.data.username !== "undefined") data.username = parsed.data.username;
      if (typeof parsed.data.name !== "undefined") data.name = sanitizeText(parsed.data.name, 100);
      if (typeof parsed.data.role !== "undefined") data.role = parsed.data.role;
      if (typeof parsed.data.mustResetPassword !== "undefined")
        data.mustResetPassword = parsed.data.mustResetPassword;
      if (typeof parsed.data.isActive !== "undefined") data.isActive = parsed.data.isActive;

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
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
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
  });

  router.post("/users/:id/reset-password", requireAuth, accountActionRateLimiter, async (req: Request, res: Response) => {
    try {
      if (!(await ensureAuthEnabled(res))) return;
      if (!requireCsrf(req, res)) return;
      if (!requireAdmin(req, res)) return;

      if (req.user.impersonatorId) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Password resets are not allowed while impersonating",
        });
      }

      const userId = String(req.params.id || "").trim();
      if (!userId) {
        return res.status(400).json({ error: "Bad request", message: "Invalid user id" });
      }

      if (userId === req.user.id) {
        return res.status(409).json({
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
        return res.status(404).json({ error: "Not found", message: "User not found" });
      }

      const tempPassword = generateTempPassword();
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(tempPassword, saltRounds);

      await prisma.user.update({
        where: { id: target.id },
        data: {
          passwordHash,
          mustResetPassword: true,
          isActive: true,
        },
      });

      try {
        await prisma.refreshToken.updateMany({
          where: { userId: target.id, revoked: false },
          data: { revoked: true },
        });
      } catch {
        if (process.env.NODE_ENV === "development") {
          console.debug("Refresh token revocation skipped (feature disabled or table missing)");
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
        user: { id: target.id, email: target.email, username: target.username, role: target.role },
        tempPassword,
      });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to reset password",
      });
    }
  });

  router.post("/impersonate", requireAuth, accountActionRateLimiter, async (req: Request, res: Response) => {
    try {
      if (!(await ensureAuthEnabled(res))) return;
      if (!requireCsrf(req, res)) return;
      const actingAdmin = await resolveImpersonationAdmin(req, res);
      if (!actingAdmin) return;

      const parsed = impersonateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Bad request", message: "Invalid impersonation payload" });
      }

      const target =
        parsed.data.userId
          ? await prisma.user.findUnique({ where: { id: parsed.data.userId } })
          : await findUserByIdentifier(parsed.data.identifier || "");

      if (!target) {
        return res.status(404).json({ error: "Not found", message: "User not found" });
      }

      if (target.id === actingAdmin.id) {
        return res.status(409).json({
          error: "Conflict",
          message: "Already using the admin account. Use stop impersonation to return.",
        });
      }

      if (!target.isActive) {
        return res.status(403).json({ error: "Forbidden", message: "Target user is inactive" });
      }

      const { accessToken, refreshToken } = generateTokens(target.id, target.email, {
        impersonatorId: actingAdmin.id,
      });
      setAuthCookies(req, res, { accessToken, refreshToken });

      if (config.enableRefreshTokenRotation) {
        const expiresAt = getRefreshTokenExpiresAt();
        try {
          await prisma.refreshToken.create({
            data: { userId: target.id, token: hashTokenForStorage(refreshToken), expiresAt },
          });
        } catch {
          if (process.env.NODE_ENV === "development") {
            console.debug("Refresh token storage skipped (feature disabled or table missing)");
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
          details: { targetUserId: target.id, initiatedFromImpersonation: Boolean(req.user?.impersonatorId) },
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
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to impersonate user",
      });
    }
  });
};
