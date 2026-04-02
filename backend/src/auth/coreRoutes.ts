import express, { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { Prisma, PrismaClient } from "../generated/client";
import { StringValue } from "ms";
import { logAuditEvent } from "../utils/audit";
import {
  authOnboardingChoiceSchema,
  authEnabledToggleSchema,
  loginSchema,
  registerSchema,
} from "./schemas";
import { getTokenLookupCandidates, hashTokenForStorage } from "./tokenSecurity";
import {
  issueBootstrapSetupCodeIfRequired,
  verifyBootstrapSetupCode,
} from "./bootstrapSetupCode";

type RegisterCoreRoutesDeps = {
  router: express.Router;
  prisma: PrismaClient;
  requireAuth: express.RequestHandler;
  optionalAuth: express.RequestHandler;
  loginAttemptRateLimiter: express.RequestHandler;
  ensureAuthEnabled: (res: Response) => Promise<boolean>;
  ensureSystemConfig: () => Promise<{
    id: string;
    authEnabled: boolean;
    authOnboardingCompleted: boolean;
    registrationEnabled: boolean;
    oidcJitProvisioningEnabled: boolean | null;
  }>;
  findUserByIdentifier: (identifier: string) => Promise<{
    id: string;
    username: string | null;
    email: string;
    passwordHash: string;
    name: string;
    role: string;
    isActive: boolean;
    mustResetPassword: boolean;
  } | null>;
  sanitizeText: (input: unknown, maxLength?: number) => string;
  requireCsrf: (req: Request, res: Response) => boolean;
  isJwtPayload: (decoded: unknown) => decoded is {
    userId: string;
    email: string;
    type: "access" | "refresh";
    impersonatorId?: string;
  };
  config: {
    authMode: "local" | "hybrid" | "oidc_enforced";
    jwtSecret: string;
    jwtAccessExpiresIn: string;
    enableRefreshTokenRotation: boolean;
    enableAuditLogging: boolean;
    oidc: {
      enabled: boolean;
      enforced: boolean;
      providerName: string;
      jitProvisioning: boolean;
    };
    bootstrapSetupCodeTtlMs: number;
    bootstrapSetupCodeMaxAttempts: number;
  };
  generateTokens: (
    userId: string,
    email: string,
    options?: { impersonatorId?: string }
  ) => { accessToken: string; refreshToken: string };
  getRefreshTokenExpiresAt: () => Date;
  isMissingRefreshTokenTableError: (error: unknown) => boolean;
  bootstrapUserId: string;
  defaultSystemConfigId: string;
  clearAuthEnabledCache: () => void;
  setAuthCookies: (
    req: Request,
    res: Response,
    tokens: { accessToken: string; refreshToken: string }
  ) => void;
  setAccessTokenCookie: (req: Request, res: Response, accessToken: string) => void;
  clearAuthCookies: (req: Request, res: Response) => void;
  readRefreshTokenFromRequest: (req: Request) => string | null;
};

class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const registerCoreRoutes = (deps: RegisterCoreRoutesDeps) => {
  const {
    router,
    prisma,
    requireAuth,
    optionalAuth,
    loginAttemptRateLimiter,
    ensureAuthEnabled,
    ensureSystemConfig,
    findUserByIdentifier,
    sanitizeText,
    requireCsrf,
    isJwtPayload,
    config,
    generateTokens,
    getRefreshTokenExpiresAt,
    isMissingRefreshTokenTableError,
    bootstrapUserId,
    defaultSystemConfigId,
    clearAuthEnabledCache,
    setAuthCookies,
    setAccessTokenCookie,
    clearAuthCookies,
    readRefreshTokenFromRequest,
  } = deps;
  const getUserTrashCollectionId = (userId: string): string => `trash:${userId}`;
  const getEffectiveOidcJitProvisioning = (systemConfig: {
    oidcJitProvisioningEnabled: boolean | null;
  }): boolean =>
    config.oidc.enabled
      ? typeof systemConfig.oidcJitProvisioningEnabled === "boolean"
        ? systemConfig.oidcJitProvisioningEnabled
        : config.oidc.jitProvisioning
      : false;

  const getAuthOnboardingStatus = async (systemConfig: {
    authEnabled: boolean;
    authOnboardingCompleted: boolean;
  }) => {
    const [activeUsers, drawingsCount, collectionsCount] = await Promise.all([
      prisma.user.count({ where: { isActive: true } }),
      prisma.drawing.count(),
      prisma.collection.count(),
    ]);
    const hasLegacyData = drawingsCount > 0 || collectionsCount > 0;
    const needsChoice =
      !systemConfig.authEnabled &&
      activeUsers === 0 &&
      !systemConfig.authOnboardingCompleted;

    return {
      activeUsers,
      hasLegacyData,
      needsChoice,
      mode: hasLegacyData ? "migration" : "fresh",
    } as const;
  };

  const ensureBootstrapUserExists = async (): Promise<void> => {
    const bootstrap = await prisma.user.findUnique({
      where: { id: bootstrapUserId },
      select: { id: true },
    });
    if (bootstrap) return;

    await prisma.user.create({
      data: {
        id: bootstrapUserId,
        email: "bootstrap@excalidash.local",
        username: null,
        passwordHash: "",
        name: "Bootstrap Admin",
        role: "ADMIN",
        mustResetPassword: true,
        isActive: false,
      },
    });
  };

  router.post("/register", loginAttemptRateLimiter, async (req: Request, res: Response) => {
    try {
      if (!(await ensureAuthEnabled(res))) return;
      if (config.authMode === "oidc_enforced") {
        return res.status(403).json({
          error: "Forbidden",
          message: "Local registration is disabled in OIDC enforced mode",
        });
      }
      if (!requireCsrf(req, res)) return;
      const parsed = registerSchema.safeParse(req.body);

      if (!parsed.success) {
        const flattened = parsed.error.flatten();
        const fieldMessages = Object.values(flattened.fieldErrors).flatMap(
          (messages) => messages ?? []
        );
        const formMessages = flattened.formErrors ?? [];
        const messages = [...formMessages, ...fieldMessages].filter(
          (message): message is string => typeof message === "string" && message.trim().length > 0
        );
        return res.status(400).json({
          error: "Validation error",
          message: messages[0] || "Invalid registration data",
          details: {
            formErrors: flattened.formErrors,
            fieldErrors: flattened.fieldErrors,
          },
        });
      }

      const { email, password, name, username, setupCode } = parsed.data;

      const systemConfig = await ensureSystemConfig();

      const activeUsers = await prisma.user.count({ where: { isActive: true } });
      const bootstrapUser = await prisma.user.findUnique({
        where: { id: bootstrapUserId },
        select: { id: true, isActive: true },
      });
      const isBootstrapFlow =
        Boolean(bootstrapUser) &&
        bootstrapUser?.isActive === false &&
        activeUsers === 0 &&
        bootstrapUser.id === bootstrapUserId;

      if (isBootstrapFlow) {
        const setupCodeVerification = await verifyBootstrapSetupCode({
          prisma,
          providedCode: setupCode,
          maxAttempts: Math.max(1, Math.floor(config.bootstrapSetupCodeMaxAttempts)),
        });
        if (!setupCodeVerification.ok) {
          const reason = (setupCodeVerification as { ok: false; reason: string }).reason;
          if (
            reason === "unavailable" ||
            reason === "expired" ||
            reason === "locked"
          ) {
            await issueBootstrapSetupCodeIfRequired({
              prisma,
              ttlMs: config.bootstrapSetupCodeTtlMs,
              authMode: config.authMode,
              reason: "bootstrap_register_reissue",
            });
          }

          if (reason === "missing") {
            return res.status(400).json({
              error: "Bad request",
              message: "Bootstrap setup code is required for first admin registration",
            });
          }
          if (reason === "invalid") {
            return res.status(401).json({
              error: "Unauthorized",
              message: "Invalid bootstrap setup code",
            });
          }
          if (reason === "locked") {
            return res.status(429).json({
              error: "Too many requests",
              message:
                "Too many invalid setup code attempts. A new setup code has been issued in backend logs.",
            });
          }
          return res.status(409).json({
            error: "Conflict",
            message:
              "Bootstrap setup code is unavailable or expired. A new setup code has been issued in backend logs.",
          });
        }

        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        const sanitizedName = sanitizeText(name, 100);

        const existingEmailUser = await prisma.user.findUnique({
          where: { email },
          select: { id: true },
        });
        if (existingEmailUser && existingEmailUser.id !== bootstrapUserId) {
          return res.status(409).json({
            error: "Conflict",
            message: "User with this email already exists",
          });
        }

        if (username) {
          const existingUsernameUser = await prisma.user.findFirst({
            where: { username },
            select: { id: true },
          });
          if (existingUsernameUser && existingUsernameUser.id !== bootstrapUserId) {
            return res.status(409).json({
              error: "Conflict",
              message: "User with this username already exists",
            });
          }
        }

        let user: {
          id: string;
          email: string;
          name: string;
          role: string;
          mustResetPassword: boolean;
        };
        try {
          user = await prisma.user.update({
            where: { id: bootstrapUserId },
            data: {
              email,
              username: username ?? null,
              passwordHash,
              name: sanitizedName,
              role: "ADMIN",
              mustResetPassword: false,
              isActive: true,
            },
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              mustResetPassword: true,
            },
          });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            return res.status(409).json({
              error: "Conflict",
              message: "User with this email or username already exists",
            });
          }
          throw error;
        }

        const trashCollectionId = getUserTrashCollectionId(user.id);
        const existingTrash = await prisma.collection.findFirst({
          where: { id: trashCollectionId, userId: user.id },
        });
        if (!existingTrash) {
          await prisma.collection.create({
            data: {
              id: trashCollectionId,
              name: "Trash",
              userId: user.id,
            },
          });
        }

        const { accessToken, refreshToken } = generateTokens(user.id, user.email);
        setAuthCookies(req, res, { accessToken, refreshToken });

        if (config.enableRefreshTokenRotation) {
          const expiresAt = getRefreshTokenExpiresAt();
          await prisma.refreshToken.create({
            data: { userId: user.id, token: hashTokenForStorage(refreshToken), expiresAt },
          });
        }

        if (config.enableAuditLogging) {
          await logAuditEvent({
            userId: user.id,
            action: "bootstrap_admin",
            ipAddress: req.ip || req.connection.remoteAddress || undefined,
            userAgent: req.headers["user-agent"] || undefined,
          });
        }

        return res.status(201).json({
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            mustResetPassword: user.mustResetPassword,
          },
          registrationEnabled: systemConfig.registrationEnabled,
          bootstrapped: true,
        });
      }

      if (!systemConfig.registrationEnabled) {
        return res.status(403).json({
          error: "Forbidden",
          message: "User registration is disabled.",
        });
      }

      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

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

      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      const sanitizedName = sanitizeText(name, 100);

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          name: sanitizedName,
          username: username ?? null,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          mustResetPassword: true,
          createdAt: true,
        },
      });

      const trashCollectionId = getUserTrashCollectionId(user.id);
      const existingTrash = await prisma.collection.findFirst({
        where: { id: trashCollectionId, userId: user.id },
      });
      if (!existingTrash) {
        await prisma.collection.create({
          data: {
            id: trashCollectionId,
            name: "Trash",
            userId: user.id,
          },
        });
      }

      const { accessToken, refreshToken } = generateTokens(user.id, user.email);
      setAuthCookies(req, res, { accessToken, refreshToken });

      if (config.enableRefreshTokenRotation) {
        const expiresAt = getRefreshTokenExpiresAt();

        try {
          await prisma.refreshToken.create({
            data: {
              userId: user.id,
              token: hashTokenForStorage(refreshToken),
              expiresAt,
            },
          });
        } catch (error) {
          if (isMissingRefreshTokenTableError(error)) {
            console.error("Refresh token rotation is enabled but refresh token storage is unavailable");
            return res.status(503).json({
              error: "Service unavailable",
              message: "Refresh token storage is unavailable. Please run database migrations.",
            });
          }
          throw error;
        }
      }

      if (config.enableAuditLogging) {
        await logAuditEvent({
          userId: user.id,
          action: "user_registered",
          ipAddress: req.ip || req.connection.remoteAddress || undefined,
          userAgent: req.headers["user-agent"] || undefined,
        });
      }

      res.status(201).json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          mustResetPassword: user.mustResetPassword,
        },
        registrationEnabled: systemConfig.registrationEnabled,
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to register user",
      });
    }
  });

  router.post("/login", loginAttemptRateLimiter, async (req: Request, res: Response) => {
    try {
      if (!(await ensureAuthEnabled(res))) return;
      if (config.authMode === "oidc_enforced") {
        return res.status(403).json({
          error: "Forbidden",
          message: "Local login is disabled in OIDC enforced mode",
        });
      }
      if (!requireCsrf(req, res)) return;
      const parsed = loginSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation error",
          message: "Invalid login credentials",
        });
      }

      const identifier = parsed.data.email || parsed.data.username || parsed.data.identifier || "";
      const { password } = parsed.data;

      const bootstrapUser = await prisma.user.findUnique({
        where: { id: bootstrapUserId },
        select: { id: true, isActive: true },
      });
      if (bootstrapUser && bootstrapUser.isActive === false) {
        const activeUsers = await prisma.user.count({ where: { isActive: true } });
        if (activeUsers === 0) {
          return res.status(409).json({
            error: "Bootstrap required",
            message: "Initial admin account has not been configured yet. Register to bootstrap.",
          });
        }
      }

      const user = await findUserByIdentifier(identifier);

      if (!user) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "Invalid email or password",
        });
      }

      if (!user.isActive) {
        // Avoid user enumeration: treat inactive accounts as invalid credentials.
        return res.status(401).json({
          error: "Unauthorized",
          message: "Invalid email or password",
        });
      }

      // Some accounts (e.g. OIDC-provisioned) may not have a usable local password hash.
      // Treat these as invalid credentials rather than throwing (bcrypt can throw on invalid hashes).
      if (!user.passwordHash || !user.passwordHash.startsWith("$2")) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "Invalid email or password",
        });
      }

      const passwordValid = await bcrypt.compare(password, user.passwordHash);

      if (!passwordValid) {
        if (config.enableAuditLogging) {
          await logAuditEvent({
            action: "login_failed",
            ipAddress: req.ip || req.connection.remoteAddress || undefined,
            userAgent: req.headers["user-agent"] || undefined,
            details: { identifier },
          });
        }

        return res.status(401).json({
          error: "Unauthorized",
          message: "Invalid email or password",
        });
      }

      const { accessToken, refreshToken } = generateTokens(user.id, user.email);
      setAuthCookies(req, res, { accessToken, refreshToken });

      if (config.enableRefreshTokenRotation) {
        const expiresAt = getRefreshTokenExpiresAt();

        try {
          await prisma.refreshToken.create({
            data: {
              userId: user.id,
              token: hashTokenForStorage(refreshToken),
              expiresAt,
            },
          });
        } catch (error) {
          if (isMissingRefreshTokenTableError(error)) {
            console.error("Refresh token rotation is enabled but refresh token storage is unavailable");
            return res.status(503).json({
              error: "Service unavailable",
              message: "Refresh token storage is unavailable. Please run database migrations.",
            });
          }
          throw error;
        }
      }

      if (config.enableAuditLogging) {
        await logAuditEvent({
          userId: user.id,
          action: "login",
          ipAddress: req.ip || req.connection.remoteAddress || undefined,
          userAgent: req.headers["user-agent"] || undefined,
        });
      }

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          mustResetPassword: user.mustResetPassword,
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to login",
      });
    }
  });

  router.post("/refresh", async (req: Request, res: Response) => {
    try {
      if (!(await ensureAuthEnabled(res))) return;
      // Refresh is cookie-only to prevent login CSRF / session swapping via cross-site form posts.
      // Require CSRF + origin checks before rotating/issuing new cookies.
      if (!requireCsrf(req, res)) return;
      const oldRefreshToken = readRefreshTokenFromRequest(req);

      if (!oldRefreshToken || typeof oldRefreshToken !== "string") {
        return res.status(401).json({
          error: "Unauthorized",
          message: "Refresh token required",
        });
      }

      try {
        const decoded = jwt.verify(oldRefreshToken, config.jwtSecret);

        if (!isJwtPayload(decoded)) {
          return res.status(401).json({
            error: "Unauthorized",
            message: "Invalid token payload",
          });
        }

        if (decoded.type !== "refresh") {
          return res.status(401).json({
            error: "Unauthorized",
            message: "Invalid token type",
          });
        }

        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: { id: true, email: true, isActive: true },
        });

        if (!user || !user.isActive) {
          return res.status(401).json({
            error: "Unauthorized",
            message: "User account not found or inactive",
          });
        }

        if (config.enableRefreshTokenRotation) {
          try {
            const { accessToken, refreshToken: newRefreshToken } = generateTokens(
              user.id,
              user.email,
              { impersonatorId: decoded.impersonatorId }
            );

            const expiresAt = getRefreshTokenExpiresAt();

            await prisma.$transaction(async (tx) => {
              const storedToken = await tx.refreshToken.findFirst({
                where: {
                  OR: getTokenLookupCandidates(oldRefreshToken).map((candidate) => ({
                    token: candidate,
                  })),
                },
              });

              if (!storedToken || storedToken.userId !== user.id || storedToken.revoked) {
                throw new HttpError(401, "Invalid or revoked refresh token");
              }

              if (new Date() > storedToken.expiresAt) {
                throw new HttpError(401, "Refresh token has expired");
              }

              const revoked = await tx.refreshToken.updateMany({
                where: { id: storedToken.id, revoked: false },
                data: { revoked: true },
              });
              if (revoked.count !== 1) {
                throw new HttpError(401, "Invalid or revoked refresh token");
              }

              await tx.refreshToken.create({
                data: {
                  userId: user.id,
                  token: hashTokenForStorage(newRefreshToken),
                  expiresAt,
                },
              });
            });

            setAuthCookies(req, res, {
              accessToken,
              refreshToken: newRefreshToken,
            });
            return res.json({ ok: true });
          } catch (error) {
            if (error instanceof HttpError) {
              return res.status(error.statusCode).json({
                error: "Unauthorized",
                message: error.message,
              });
            }

            if (isMissingRefreshTokenTableError(error)) {
              console.error("Refresh token rotation is enabled but refresh token storage is unavailable");
              return res.status(503).json({
                error: "Service unavailable",
                message: "Refresh token storage is unavailable. Please run database migrations.",
              });
            } else {
              console.error("Refresh token rotation error:", error);
              return res.status(500).json({
                error: "Internal server error",
                message: "Failed to rotate refresh token",
              });
            }
          }
        }

        const signOptions: SignOptions = {
          expiresIn: config.jwtAccessExpiresIn as StringValue,
        };
        const accessToken = jwt.sign(
          {
            userId: user.id,
            email: user.email,
            type: "access",
            impersonatorId: decoded.impersonatorId,
          },
          config.jwtSecret,
          signOptions
        );

        setAccessTokenCookie(req, res, accessToken);
        res.json({ ok: true });
      } catch {
        return res.status(401).json({
          error: "Unauthorized",
          message: "Invalid or expired refresh token",
        });
      }
    } catch (error) {
      console.error("Refresh token error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to refresh token",
      });
    }
  });

  router.post("/logout", optionalAuth, async (req: Request, res: Response) => {
    try {
      if (!(await ensureAuthEnabled(res))) return;
      if (!requireCsrf(req, res)) return;

      clearAuthCookies(req, res);

      if (config.enableRefreshTokenRotation && req.user?.id) {
        await prisma.refreshToken.updateMany({
          where: { userId: req.user.id, revoked: false },
          data: { revoked: true },
        });
      }

      return res.json({ ok: true });
    } catch (error) {
      console.error("Logout error:", error);
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to logout",
      });
    }
  });

  router.post("/stop-impersonation", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!(await ensureAuthEnabled(res))) return;
      if (!requireCsrf(req, res)) return;
      if (!req.user) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "User not authenticated",
        });
      }

      if (!req.user.impersonatorId) {
        return res.status(409).json({
          error: "Conflict",
          message: "Not currently impersonating another user",
        });
      }

      const impersonator = await prisma.user.findUnique({
        where: { id: req.user.impersonatorId },
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

      if (!impersonator || !impersonator.isActive || impersonator.role !== "ADMIN") {
        return res.status(403).json({
          error: "Forbidden",
          message: "Impersonator account is unavailable or no longer authorized",
        });
      }

      const { accessToken, refreshToken } = generateTokens(
        impersonator.id,
        impersonator.email
      );
      setAuthCookies(req, res, { accessToken, refreshToken });

      if (config.enableRefreshTokenRotation) {
        const expiresAt = getRefreshTokenExpiresAt();
        try {
          await prisma.refreshToken.create({
            data: {
              userId: impersonator.id,
              token: hashTokenForStorage(refreshToken),
              expiresAt,
            },
          });
        } catch (error) {
          if (isMissingRefreshTokenTableError(error)) {
            return res.status(503).json({
              error: "Service unavailable",
              message: "Refresh token storage is unavailable. Please run database migrations.",
            });
          }
          throw error;
        }
      }

      return res.json({
        user: {
          id: impersonator.id,
          username: impersonator.username,
          email: impersonator.email,
          name: impersonator.name,
          role: impersonator.role,
          mustResetPassword: impersonator.mustResetPassword,
        },
      });
    } catch (error) {
      console.error("Stop impersonation error:", error);
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to stop impersonation",
      });
    }
  });

  router.get("/me", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!(await ensureAuthEnabled(res))) return;
      if (!req.user) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "User not authenticated",
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
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

      if (!user) {
        return res.status(404).json({
          error: "Not found",
          message: "User not found",
        });
      }

      res.json({ user });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to get user information",
      });
    }
  });

  router.get("/status", optionalAuth, async (req: Request, res: Response) => {
    try {
      const systemConfig = await ensureSystemConfig();
      const onboarding = await getAuthOnboardingStatus(systemConfig);
      const effectiveAuthEnabled =
        config.authMode !== "local" ? true : systemConfig.authEnabled;
      const oidcJitProvisioningEnabled = getEffectiveOidcJitProvisioning(systemConfig);
      const onboardingRequired = config.authMode === "local" ? onboarding.needsChoice : false;
      const onboardingMode = config.authMode === "local" ? onboarding.mode : null;
      if (!effectiveAuthEnabled) {
        return res.json({
          enabled: false,
          authenticated: false,
          authEnabled: false,
          authMode: config.authMode,
          oidcEnabled: config.oidc.enabled,
          oidcEnforced: config.oidc.enforced,
          oidcProvider: config.oidc.providerName,
          oidcJitProvisioningEnabled,
          registrationEnabled: false,
          bootstrapRequired: false,
          authOnboardingRequired: onboardingRequired,
          authOnboardingMode: onboardingMode,
          authOnboardingRecommended: onboardingRequired ? "enable" : null,
          user: null,
        });
      }

      const bootstrapUser = await prisma.user.findUnique({
        where: { id: bootstrapUserId },
        select: { id: true, isActive: true },
      });
      const bootstrapRequired =
        !config.oidc.enforced &&
        Boolean(bootstrapUser && bootstrapUser.isActive === false) &&
        onboarding.activeUsers === 0;

      res.json({
        enabled: true,
        authEnabled: true,
        authMode: config.authMode,
        oidcEnabled: config.oidc.enabled,
        oidcEnforced: config.oidc.enforced,
        oidcProvider: config.oidc.providerName,
        oidcJitProvisioningEnabled,
        authenticated: Boolean(req.user),
        registrationEnabled: systemConfig.registrationEnabled,
        bootstrapRequired,
        authOnboardingRequired: onboardingRequired,
        authOnboardingMode: onboardingMode,
        authOnboardingRecommended: onboardingRequired ? "enable" : null,
        user: req.user
          ? {
              id: req.user.id,
              username: req.user.username ?? null,
              email: req.user.email,
              name: req.user.name,
              role: req.user.role,
              mustResetPassword: req.user.mustResetPassword ?? false,
              impersonatorId: req.user.impersonatorId,
            }
          : null,
      });
    } catch (error) {
      console.error("Auth status error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to fetch auth status",
      });
    }
  });

  router.post("/onboarding-choice", optionalAuth, async (req: Request, res: Response) => {
    try {
      if (config.authMode !== "local") {
        return res.status(409).json({
          error: "Conflict",
          message: "Onboarding choice is managed by AUTH_MODE configuration",
        });
      }
      if (!requireCsrf(req, res)) return;
      const parsed = authOnboardingChoiceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Bad request",
          message: "Invalid onboarding choice payload",
        });
      }

      const systemConfig = await ensureSystemConfig();
      const onboarding = await getAuthOnboardingStatus(systemConfig);
      if (!onboarding.needsChoice) {
        return res.status(409).json({
          error: "Conflict",
          message: "Authentication onboarding is already completed",
        });
      }

      const nextAuthEnabled = parsed.data.enableAuth;
      if (nextAuthEnabled) {
        await ensureBootstrapUserExists();
      }

      const updated = await prisma.systemConfig.upsert({
        where: { id: defaultSystemConfigId },
        update: {
          authEnabled: nextAuthEnabled,
          authOnboardingCompleted: true,
        },
        create: {
          id: defaultSystemConfigId,
          authEnabled: nextAuthEnabled,
          authOnboardingCompleted: true,
          registrationEnabled: systemConfig.registrationEnabled,
        },
      });

      clearAuthEnabledCache();
      if (nextAuthEnabled) {
        await issueBootstrapSetupCodeIfRequired({
          prisma,
          ttlMs: config.bootstrapSetupCodeTtlMs,
          authMode: config.authMode,
          reason: "onboarding_enabled",
        });
      }

      return res.json({
        authEnabled: updated.authEnabled,
        authOnboardingCompleted: updated.authOnboardingCompleted,
        bootstrapRequired: Boolean(nextAuthEnabled),
      });
    } catch (error) {
      console.error("Auth onboarding choice error:", error);
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to apply authentication onboarding choice",
      });
    }
  });

  router.post("/auth-enabled", requireAuth, async (req: Request, res: Response) => {
    try {
      if (config.authMode !== "local") {
        return res.status(409).json({
          error: "Conflict",
          message: `Authentication mode is managed by AUTH_MODE=${config.authMode}`,
        });
      }
      if (!requireCsrf(req, res)) return;
      if (!req.user) {
        return res
          .status(401)
          .json({ error: "Unauthorized", message: "User not authenticated" });
      }
      if (req.user.role !== "ADMIN") {
        return res
          .status(403)
          .json({ error: "Forbidden", message: "Admin access required" });
      }

      const parsed = authEnabledToggleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Bad request", message: "Invalid toggle payload" });
      }

      const systemConfig = await ensureSystemConfig();
      const current = systemConfig.authEnabled;
      const next = parsed.data.enabled;

      if (!current && next) {
        const bootstrap = await prisma.user.findUnique({
          where: { id: bootstrapUserId },
          select: { id: true },
        });
        if (!bootstrap) {
          await prisma.user.create({
            data: {
              id: bootstrapUserId,
              email: "bootstrap@excalidash.local",
              username: null,
              passwordHash: "",
              name: "Bootstrap Admin",
              role: "ADMIN",
              mustResetPassword: true,
              isActive: false,
            },
          });
        }
      }

      const updated = await prisma.systemConfig.upsert({
        where: { id: defaultSystemConfigId },
        update: { authEnabled: next, authOnboardingCompleted: true },
        create: {
          id: defaultSystemConfigId,
          authEnabled: next,
          authOnboardingCompleted: true,
          registrationEnabled: systemConfig.registrationEnabled,
        },
      });
      clearAuthEnabledCache();
      if (!current && next) {
        await issueBootstrapSetupCodeIfRequired({
          prisma,
          ttlMs: config.bootstrapSetupCodeTtlMs,
          authMode: config.authMode,
          reason: "auth_enabled_toggle",
        });
      }

      const bootstrapUser = await prisma.user.findUnique({
        where: { id: bootstrapUserId },
        select: { id: true, isActive: true },
      });
      const activeUsers = await prisma.user.count({ where: { isActive: true } });
      const bootstrapRequired =
        Boolean(updated.authEnabled && bootstrapUser && bootstrapUser.isActive === false) &&
        activeUsers === 0;

      res.json({ authEnabled: updated.authEnabled, bootstrapRequired });
    } catch (error) {
      console.error("Auth enabled toggle error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: "Failed to update authentication mode",
      });
    }
  });
};
