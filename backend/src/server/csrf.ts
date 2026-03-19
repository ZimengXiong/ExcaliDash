import express from "express";
import crypto from "crypto";
import {
  createCsrfToken,
  getCsrfTokenHeader,
  getOriginFromReferer,
  validateCsrfToken,
} from "../security";
import {
  CSRF_CLIENT_COOKIE_NAME,
  getCsrfClientCookieValue,
  getCsrfValidationClientIds,
} from "../security/csrfClient";
import { logger } from "../logger";

const CSRF_CLIENT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const CSRF_RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

type RegisterCsrfProtectionDeps = {
  app: express.Express;
  isAllowedOrigin: (origin?: string) => boolean;
  maxRequestsPerWindow: number;
  enableDebugLogging?: boolean;
};

export const registerCsrfProtection = ({
  app,
  isAllowedOrigin,
  maxRequestsPerWindow,
  enableDebugLogging,
}: RegisterCsrfProtectionDeps) => {
  const canTrustProxyHeaders = (req: express.Request): boolean => {
    const trustProxy = req.app.get("trust proxy");
    if (trustProxy === true) return true;
    if (typeof trustProxy === "number") return trustProxy > 0;
    if (typeof trustProxy === "function") return true;
    return false;
  };

  const requestUsesHttps = (req: express.Request): boolean => {
    if (req.secure) return true;
    if (!canTrustProxyHeaders(req)) return false;
    const forwardedProto = req.headers["x-forwarded-proto"];
    const raw = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
    const firstHop = String(raw || "")
      .split(",")[0]
      .trim()
      .toLowerCase();
    return firstHop === "https";
  };

  const setCsrfClientCookie = (req: express.Request, res: express.Response, value: string): void => {
    const secure = requestUsesHttps(req) ? "; Secure" : "";
    res.append(
      "Set-Cookie",
      `${CSRF_CLIENT_COOKIE_NAME}=${encodeURIComponent(
        value
      )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${CSRF_CLIENT_COOKIE_MAX_AGE_SECONDS}${secure}`
    );
  };

  const getClientIdForTokenIssue = (
    req: express.Request,
    res: express.Response
  ): { clientId: string; strategy: "cookie" } => {
    const existingCookieValue = getCsrfClientCookieValue(req);
    if (existingCookieValue) {
      return {
        clientId: `cookie:${existingCookieValue}`,
        strategy: "cookie",
      };
    }

    const generatedCookieValue = crypto.randomUUID().replace(/-/g, "");
    setCsrfClientCookie(req, res, generatedCookieValue);
    return {
      clientId: `cookie:${generatedCookieValue}`,
      strategy: "cookie",
    };
  };

  const getClientIdForTokenIssueDebug = (
    req: express.Request,
    res: express.Response
  ): string => {
    const { clientId, strategy } = getClientIdForTokenIssue(req, res);

    if (enableDebugLogging) {
      const validationCandidates = getCsrfValidationClientIds(req);
      const ip = req.ip || req.connection.remoteAddress || "unknown";
      logger.debug({
        method: req.method,
        path: req.path,
        ip,
        remoteAddress: req.connection.remoteAddress,
        hasCsrfCookie: Boolean(getCsrfClientCookieValue(req)),
        clientIdPreview: clientId.slice(0, 60) + "...",
        trustProxySetting: req.app.get("trust proxy"),
        strategy,
        validationCandidatesCount: validationCandidates.length,
      }, "CSRF getClientId");
    }

    return clientId;
  };

  const csrfRateLimit = new Map<string, { count: number; resetTime: number }>();
  let csrfCleanupCounter = 0;

  app.get("/csrf-token", (req, res) => {
    const ip = req.ip || req.connection.remoteAddress || "unknown";
    const now = Date.now();
    const clientLimit = csrfRateLimit.get(ip);

    if (clientLimit && now < clientLimit.resetTime) {
      if (clientLimit.count >= maxRequestsPerWindow) {
        return res.status(429).json({
          error: "Rate limit exceeded",
          message: "Too many CSRF token requests",
        });
      }
      clientLimit.count++;
    } else {
      csrfRateLimit.set(ip, { count: 1, resetTime: now + CSRF_RATE_LIMIT_WINDOW });
    }

    csrfCleanupCounter += 1;
    if (csrfCleanupCounter % 100 === 0) {
      for (const [key, data] of csrfRateLimit.entries()) {
        if (now > data.resetTime) csrfRateLimit.delete(key);
      }
    }

    const clientId = getClientIdForTokenIssueDebug(req, res);
    const token = createCsrfToken(clientId);

    res.json({
      token,
      header: getCsrfTokenHeader(),
    });
  });

  const csrfProtectionMiddleware = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    const safeMethods = ["GET", "HEAD", "OPTIONS"];
    if (safeMethods.includes(req.method)) {
      return next();
    }

    const origin = req.headers["origin"];
    const referer = req.headers["referer"];
    const originValue = Array.isArray(origin) ? origin[0] : origin;
    const refererValue = Array.isArray(referer) ? referer[0] : referer;

    if (originValue) {
      if (!isAllowedOrigin(originValue)) {
        return res.status(403).json({
          error: "CSRF origin mismatch",
          message: "Origin not allowed",
        });
      }
    } else if (refererValue) {
      const refererOrigin = getOriginFromReferer(refererValue);
      if (!refererOrigin || !isAllowedOrigin(refererOrigin)) {
        return res.status(403).json({
          error: "CSRF referer mismatch",
          message: "Referer not allowed",
        });
      }
    }

    const clientIdCandidates = getCsrfValidationClientIds(req);
    const headerName = getCsrfTokenHeader();
    const tokenHeader = req.headers[headerName];
    const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;

    if (!token) {
      return res.status(403).json({
        error: "CSRF token missing",
        message: `Missing ${headerName} header`,
      });
    }

    const isValidToken = clientIdCandidates.some((clientId) =>
      validateCsrfToken(clientId, token)
    );
    if (!isValidToken) {
      return res.status(403).json({
        error: "CSRF token invalid",
        message: "Invalid or expired CSRF token. Please refresh and try again.",
      });
    }

    next();
  };

  app.use((req, res, next) => {
    if (req.path.startsWith("/auth/")) {
      return next();
    }
    csrfProtectionMiddleware(req, res, next);
  });
};
