/**
 * Rate limiting middleware
 * Extracts duplicated rate limiting logic from index.ts
 */
import { Request, Response, NextFunction } from "express";

const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes

/**
 * Generic rate limiter factory
 * Consolidates the duplicated rate limiting pattern
 */
export const createRateLimiter = (options: {
  maxRequests: number;
  windowMs?: number;
  errorMessage?: string;
  keyExtractor?: (req: Request) => string;
}) => {
  const {
    maxRequests,
    windowMs = RATE_LIMIT_WINDOW,
    errorMessage = "Too many requests, please try again later",
    keyExtractor = (req: Request) => req.ip || req.connection.remoteAddress || "unknown",
  } = options;

  const requestCounts = new Map<string, { count: number; resetTime: number }>();

  // Cleanup interval
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, data] of requestCounts.entries()) {
      if (now > data.resetTime) {
        requestCounts.delete(key);
      }
    }
  }, 5 * 60 * 1000);
  cleanupInterval.unref();

  const middleware = (req: Request, res: Response, next: NextFunction) => {
    const key = keyExtractor(req);
    const now = Date.now();
    const clientData = requestCounts.get(key);

    if (!clientData || now > clientData.resetTime) {
      requestCounts.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (clientData.count >= maxRequests) {
      return res.status(429).json({
        error: "Rate limit exceeded",
        message: errorMessage,
      });
    }

    clientData.count++;
    next();
  };

  return { middleware, cleanup: () => clearInterval(cleanupInterval) };
};

/**
 * Default rate limiter for general API requests
 */
export const createDefaultRateLimiter = () => {
  const maxRequests = (() => {
    const parsed = Number(process.env.RATE_LIMIT_MAX_REQUESTS);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 1000;
    }
    return parsed;
  })();

  return createRateLimiter({ maxRequests });
};

/**
 * CSRF token rate limiter (more restrictive)
 */
export const createCsrfRateLimiter = () => {
  const maxRequests = (() => {
    const parsed = Number(process.env.CSRF_MAX_REQUESTS);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 60; // 1 per second average
    }
    return parsed;
  })();

  return createRateLimiter({
    maxRequests,
    windowMs: 60 * 1000, // 1 minute window
    errorMessage: "Too many CSRF token requests",
  });
};
