import express, { Request, Response } from "express";
import crypto from "crypto";
import jwt, { SignOptions } from "jsonwebtoken";
import ms, { type StringValue } from "ms";
import { Prisma, PrismaClient } from "./generated/client";
import { config } from "./config";
import {
  requireAuth as defaultRequireAuth,
  optionalAuth as defaultOptionalAuth,
  authModeService as defaultAuthModeService,
} from "./middleware/auth";
import {
  getCsrfTokenHeader,
  getOriginFromReferer,
  sanitizeText,
  validateCsrfToken,
} from "./security";
import rateLimit, { MemoryStore } from "express-rate-limit";
import { registerAccountRoutes } from "./auth/accountRoutes";
import { registerAdminRoutes } from "./auth/adminRoutes";
import { registerCoreRoutes } from "./auth/coreRoutes";
import { registerOidcRoutes } from "./auth/oidcRoutes";
import { prisma as defaultPrisma } from "./db/prisma";
import {
  BOOTSTRAP_USER_ID,
  DEFAULT_SYSTEM_CONFIG_ID,
  type AuthModeService,
} from "./auth/authMode";
import { getCsrfValidationClientIds } from "./security/csrfClient";
import {
  clearAuthCookies,
  readCookie,
  REFRESH_TOKEN_COOKIE_NAME,
  setAccessTokenCookie,
  setAuthCookies,
} from "./auth/cookies";

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
  return (
    typeof payload.userId === "string" &&
    typeof payload.email === "string" &&
    (payload.type === "access" || payload.type === "refresh")
  );
};

const normalizeOrigins = (rawOrigins?: string): string[] => {
  const fallback = "http://localhost:6767";
  if (!rawOrigins || rawOrigins.trim().length === 0) {
    return [fallback];
  }

  const ensureProtocol = (origin: string) =>
    /^https?:\/\//i.test(origin) ? origin : `http://${origin}`;

  const removeTrailingSlash = (origin: string) =>
    origin.endsWith("/") ? origin.slice(0, -1) : origin;

  const parsed = rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map(ensureProtocol)
    .map(removeTrailingSlash);

  return parsed.length > 0 ? parsed : [fallback];
};

const allowedOrigins = normalizeOrigins(config.frontendUrl);
const isDev = config.nodeEnv !== "production";
const isLocalDevOrigin = (origin: string): boolean => {
  return (
    /^http:\/\/localhost:\d+$/i.test(origin) ||
    /^http:\/\/127\.0\.0\.1:\d+$/i.test(origin)
  );
};

const isAllowedAuthOrigin = (origin?: string): boolean => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (isDev && isLocalDevOrigin(origin)) return true;
  return false;
};

type CreateAuthRouterDeps = {
  prisma: PrismaClient;
  requireAuth: express.RequestHandler;
  optionalAuth: express.RequestHandler;
  authModeService: AuthModeService;
};

export const createAuthRouter = (deps: CreateAuthRouterDeps): express.Router => {
  const { prisma, requireAuth, optionalAuth, authModeService } = deps;
  const router = express.Router();

  const ensureSystemConfig = authModeService.ensureSystemConfig;

  const ensureAuthEnabled = async (res: Response): Promise<boolean> => {
    const systemConfig = await ensureSystemConfig();
    const authEnabled =
      config.authMode !== "local" ? true : systemConfig.authEnabled;
    if (!authEnabled) {
      res.status(404).json({
        error: "Not found",
        message: "Authentication is disabled",
      });
      return false;
    }
    return true;
  };

  type LoginRateLimitConfig = {
    enabled: boolean;
    windowMs: number;
    max: number;
  };

  const DEFAULT_LOGIN_RATE_LIMIT: LoginRateLimitConfig = {
    enabled: true,
    windowMs: 15 * 60 * 1000,
    max: 20,
  };

  let loginRateLimitConfig: LoginRateLimitConfig = { ...DEFAULT_LOGIN_RATE_LIMIT };
  let loginAttemptLimiter: ReturnType<typeof rateLimit> | null = null;
  let loginLimiterInitPromise: Promise<void> | null = null;
  let loginIdentifierKeyIndex = new Map<string, Set<string>>();

  const parseLoginRateLimitConfig = (
    systemConfig: Awaited<ReturnType<typeof ensureSystemConfig>>
  ): LoginRateLimitConfig => {
    const enabled =
      typeof systemConfig.authLoginRateLimitEnabled === "boolean"
        ? systemConfig.authLoginRateLimitEnabled
        : DEFAULT_LOGIN_RATE_LIMIT.enabled;
    const windowMs =
      Number.isFinite(Number(systemConfig.authLoginRateLimitWindowMs)) &&
      Number(systemConfig.authLoginRateLimitWindowMs) > 0
        ? Number(systemConfig.authLoginRateLimitWindowMs)
        : DEFAULT_LOGIN_RATE_LIMIT.windowMs;
    const max =
      Number.isFinite(Number(systemConfig.authLoginRateLimitMax)) &&
      Number(systemConfig.authLoginRateLimitMax) > 0
        ? Number(systemConfig.authLoginRateLimitMax)
        : DEFAULT_LOGIN_RATE_LIMIT.max;
    return { enabled, windowMs, max };
  };

  const resolveAuthIdentifier = (req: Request): string | null => {
    const body = (req.body || {}) as Record<string, unknown>;
    const raw =
      (typeof body.email === "string" && body.email) ||
      (typeof body.username === "string" && body.username) ||
      (typeof body.identifier === "string" && body.identifier) ||
      null;
    if (!raw) return null;
    const trimmed = raw.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed.slice(0, 255) : null;
  };

  const resolveRateLimitIp = (req: Request): string =>
    (req.ip || req.connection.remoteAddress || "unknown").slice(0, 255);

  const trackIdentifierRateLimitKey = (identifier: string, key: string): void => {
    if (!loginIdentifierKeyIndex.has(identifier) && loginIdentifierKeyIndex.size >= 5000) {
      const oldestIdentifier = loginIdentifierKeyIndex.keys().next().value;
      if (typeof oldestIdentifier === "string") {
        loginIdentifierKeyIndex.delete(oldestIdentifier);
      }
    }

    const existing = loginIdentifierKeyIndex.get(identifier) ?? new Set<string>();
    if (existing.size >= 50) {
      const oldestKey = existing.values().next().value;
      if (typeof oldestKey === "string") {
        existing.delete(oldestKey);
      }
    }
    existing.add(key);
    loginIdentifierKeyIndex.set(identifier, existing);
  };

  const buildLoginAttemptLimiter = (cfg: LoginRateLimitConfig) => {
    const store = new MemoryStore();
    loginIdentifierKeyIndex = new Map<string, Set<string>>();
    const limiter = rateLimit({
      windowMs: cfg.windowMs,
      max: cfg.max,
      message: {
        error: "Too many requests",
        message: "Too many login attempts, please try again later",
      },
      standardHeaders: true,
      legacyHeaders: false,
      validate: {
        trustProxy: false,
        xForwardedForHeader: false,
      },
      store,
      keyGenerator: (req) => {
        const identifier = resolveAuthIdentifier(req as Request);
        const ip = resolveRateLimitIp(req as Request);
        if (identifier) {
          const key = `login:${identifier}:ip:${ip}`;
          trackIdentifierRateLimitKey(identifier, key);
          return key;
        }
        return `login-ip:${ip}`;
      },
    });

    loginAttemptLimiter = limiter;
  };

  const initLoginAttemptLimiter = async () => {
    const systemConfig = await ensureSystemConfig();
    loginRateLimitConfig = parseLoginRateLimitConfig(systemConfig);
    buildLoginAttemptLimiter(loginRateLimitConfig);
  };

  const ensureLoginAttemptLimiter = async () => {
    if (loginAttemptLimiter) return;
    if (!loginLimiterInitPromise) {
      loginLimiterInitPromise = initLoginAttemptLimiter().finally(() => {
        loginLimiterInitPromise = null;
      });
    }
    await loginLimiterInitPromise;
  };

  const applyLoginRateLimitConfig = (
    systemConfig: Pick<
      Awaited<ReturnType<typeof ensureSystemConfig>>,
      "authLoginRateLimitEnabled" | "authLoginRateLimitWindowMs" | "authLoginRateLimitMax"
    >
  ): LoginRateLimitConfig => {
    loginRateLimitConfig = parseLoginRateLimitConfig(
      systemConfig as Awaited<ReturnType<typeof ensureSystemConfig>>
    );
    buildLoginAttemptLimiter(loginRateLimitConfig);
    return loginRateLimitConfig;
  };

  const resetLoginAttemptKey = async (identifier: string): Promise<void> => {
    await ensureLoginAttemptLimiter();
    const normalizedIdentifier = identifier.trim().toLowerCase();
    const keys = loginIdentifierKeyIndex.get(normalizedIdentifier);
    try {
      if (!keys || keys.size === 0) {
        await loginAttemptLimiter?.resetKey(`login:${normalizedIdentifier}`);
        return;
      }
      for (const key of keys) {
        await loginAttemptLimiter?.resetKey(key);
      }
      loginIdentifierKeyIndex.delete(normalizedIdentifier);
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.debug("Rate limit reset skipped:", error);
      }
    }
  };

  const loginAttemptRateLimiter = async (
    req: Request,
    res: Response,
    next: express.NextFunction
  ) => {
    await ensureLoginAttemptLimiter();
    if (!loginRateLimitConfig.enabled) return next();
    return (loginAttemptLimiter as ReturnType<typeof rateLimit>)(req, res, next);
  };

  const accountActionRateLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 60,
    message: {
      error: "Too many requests",
      message: "Too many requests, please try again later",
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: {
      trustProxy: false,
      xForwardedForHeader: false,
    },
  });

  const generateTempPassword = (): string => {
    const buf = crypto.randomBytes(18);
    return buf.toString("base64").replace(/[+/=]/g, "").slice(0, 24);
  };

  const findUserByIdentifier = async (identifier: string) => {
    const trimmed = identifier.trim();
    if (trimmed.length === 0) return null;

    const looksLikeEmail = trimmed.includes("@");
    if (looksLikeEmail) {
      return prisma.user.findUnique({
        where: { email: trimmed.toLowerCase() },
      });
    }

    return prisma.user.findFirst({
      where: {
        OR: [{ username: trimmed }, { email: trimmed.toLowerCase() }],
      },
    });
  };

  const requireAdmin = (
    req: Request,
    res: Response
  ): req is Request & { user: NonNullable<Request["user"]> } => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized", message: "User not authenticated" });
      return false;
    }
    if (req.user.role !== "ADMIN") {
      res.status(403).json({ error: "Forbidden", message: "Admin access required" });
      return false;
    }
    return true;
  };

  const requireCsrf = (req: Request, res: Response): boolean => {
    const origin = req.headers["origin"];
    const referer = req.headers["referer"];
    const originValue = Array.isArray(origin) ? origin[0] : origin;
    const refererValue = Array.isArray(referer) ? referer[0] : referer;

    if (originValue) {
      if (!isAllowedAuthOrigin(originValue)) {
        res.status(403).json({
          error: "CSRF origin mismatch",
          message: "Origin not allowed",
        });
        return false;
      }
    } else if (refererValue) {
      const refererOrigin = getOriginFromReferer(refererValue);
      if (!refererOrigin || !isAllowedAuthOrigin(refererOrigin)) {
        res.status(403).json({
          error: "CSRF referer mismatch",
          message: "Referer not allowed",
        });
        return false;
      }
    }

    const headerName = getCsrfTokenHeader();
    const tokenHeader = req.headers[headerName];
    const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;

    if (!token) {
      res.status(403).json({
        error: "CSRF token missing",
        message: `Missing ${headerName} header`,
      });
      return false;
    }

    const clientIds = getCsrfValidationClientIds(req);
    const isValidToken = clientIds.some((clientId) => validateCsrfToken(clientId, token));
    if (!isValidToken) {
      res.status(403).json({
        error: "CSRF token invalid",
        message: "Invalid or expired CSRF token. Please refresh and try again.",
      });
      return false;
    }

    return true;
  };

  const countActiveAdmins = async () => {
    return prisma.user.count({
      where: { role: "ADMIN", isActive: true },
    });
  };

  const generateTokens = (
    userId: string,
    email: string,
    options?: { impersonatorId?: string }
  ) => {
    const signOptions: SignOptions = {
      expiresIn: config.jwtAccessExpiresIn as StringValue,
      jwtid: crypto.randomUUID(),
    };
    const accessToken = jwt.sign(
      { userId, email, type: "access", impersonatorId: options?.impersonatorId },
      config.jwtSecret,
      signOptions
    );

    const refreshSignOptions: SignOptions = {
      expiresIn: config.jwtRefreshExpiresIn as StringValue,
      jwtid: crypto.randomUUID(),
    };
    const refreshToken = jwt.sign(
      { userId, email, type: "refresh", impersonatorId: options?.impersonatorId },
      config.jwtSecret,
      refreshSignOptions
    );

    return { accessToken, refreshToken };
  };

  const resolveExpiresAt = (expiresIn: string, fallbackMs: number): Date => {
    const parsed = ms(expiresIn as StringValue);
    const ttlMs = typeof parsed === "number" && parsed > 0 ? parsed : fallbackMs;
    return new Date(Date.now() + ttlMs);
  };

  const isMissingRefreshTokenTableError = (error: unknown): boolean => {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2021") {
        return true;
      }
    }

    const message =
      typeof error === "object" && error && "message" in error
        ? String((error as any).message)
        : "";
    return /no such table:\s*RefreshToken/i.test(message);
  };

  const getRefreshTokenExpiresAt = (): Date =>
    resolveExpiresAt(config.jwtRefreshExpiresIn, 7 * 24 * 60 * 60 * 1000);

  registerOidcRoutes({
    router,
    prisma,
    ensureAuthEnabled,
    ensureSystemConfig,
    sanitizeText,
    generateTokens,
    setAuthCookies,
    getRefreshTokenExpiresAt,
    isMissingRefreshTokenTableError,
    config,
  });

  registerCoreRoutes({
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
    bootstrapUserId: BOOTSTRAP_USER_ID,
    defaultSystemConfigId: DEFAULT_SYSTEM_CONFIG_ID,
    clearAuthEnabledCache: authModeService.clearAuthEnabledCache,
    setAuthCookies,
    setAccessTokenCookie,
    clearAuthCookies,
    readRefreshTokenFromRequest: (req) => readCookie(req, REFRESH_TOKEN_COOKIE_NAME),
  });

  registerAdminRoutes({
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
    defaultSystemConfigId: DEFAULT_SYSTEM_CONFIG_ID,
    setAuthCookies,
    requireCsrf,
  });

  registerAccountRoutes({
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
  });

  return router;
};

const authRouter = createAuthRouter({
  prisma: defaultPrisma,
  requireAuth: defaultRequireAuth,
  optionalAuth: defaultOptionalAuth,
  authModeService: defaultAuthModeService,
});

export default authRouter;
