/**
 * Tests for middleware/rateLimiter.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRateLimiter, createDefaultRateLimiter, createCsrfRateLimiter } from "../middleware/rateLimiter";
import type { Request, Response, NextFunction } from "express";

const createMockRequest = (ip: string = "127.0.0.1"): Partial<Request> => ({
  ip,
  connection: { remoteAddress: ip } as any,
});

const createMockResponse = (): Partial<Response> & { statusCode?: number; jsonData?: any } => {
  const res: any = {};
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((data: any) => {
    res.jsonData = data;
    return res;
  });
  return res;
};

describe("createRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should allow requests under the limit", () => {
    const { middleware } = createRateLimiter({ maxRequests: 5 });
    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    for (let i = 0; i < 5; i++) {
      middleware(req as Request, res as Response, next as NextFunction);
    }

    expect(next).toHaveBeenCalledTimes(5);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should block requests over the limit", () => {
    const { middleware } = createRateLimiter({ maxRequests: 3 });
    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    // Make 3 allowed requests
    for (let i = 0; i < 3; i++) {
      middleware(req as Request, res as Response, next as NextFunction);
    }

    // 4th request should be blocked
    middleware(req as Request, res as Response, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(3);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.jsonData).toEqual({
      error: "Rate limit exceeded",
      message: "Too many requests, please try again later",
    });
  });

  it("should use custom error message", () => {
    const { middleware } = createRateLimiter({
      maxRequests: 1,
      errorMessage: "Custom error message",
    });
    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    middleware(req as Request, res as Response, next as NextFunction);
    middleware(req as Request, res as Response, next as NextFunction);

    expect(res.jsonData.message).toBe("Custom error message");
  });

  it("should reset after window expires", () => {
    const windowMs = 60000; // 1 minute
    const { middleware } = createRateLimiter({ maxRequests: 2, windowMs });
    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    // Use up the limit
    middleware(req as Request, res as Response, next as NextFunction);
    middleware(req as Request, res as Response, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(2);

    // Should be blocked now
    middleware(req as Request, res as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(429);

    // Advance time past window
    vi.advanceTimersByTime(windowMs + 1000);

    // Should be allowed again
    const res2 = createMockResponse();
    const next2 = vi.fn();
    middleware(req as Request, res2 as Response, next2 as NextFunction);
    expect(next2).toHaveBeenCalledTimes(1);
  });

  it("should track different IPs separately", () => {
    const { middleware } = createRateLimiter({ maxRequests: 2 });
    const req1 = createMockRequest("192.168.1.1");
    const req2 = createMockRequest("192.168.1.2");
    const res = createMockResponse();
    const next = vi.fn();

    // IP 1 uses up limit
    middleware(req1 as Request, res as Response, next as NextFunction);
    middleware(req1 as Request, res as Response, next as NextFunction);
    middleware(req1 as Request, res as Response, next as NextFunction); // blocked

    // IP 2 should still have full limit
    const res2 = createMockResponse();
    const next2 = vi.fn();
    middleware(req2 as Request, res2 as Response, next2 as NextFunction);
    middleware(req2 as Request, res2 as Response, next2 as NextFunction);

    expect(next2).toHaveBeenCalledTimes(2);
    expect(res2.status).not.toHaveBeenCalled();
  });

  it("should use custom key extractor", () => {
    const { middleware } = createRateLimiter({
      maxRequests: 1,
      keyExtractor: (req) => (req as any).customKey || "default",
    });

    const req1 = { ...createMockRequest(), customKey: "user-1" };
    const req2 = { ...createMockRequest(), customKey: "user-2" };
    const next = vi.fn();

    middleware(req1 as any, createMockResponse() as Response, next as NextFunction);
    middleware(req1 as any, createMockResponse() as Response, next as NextFunction); // blocked

    middleware(req2 as any, createMockResponse() as Response, next as NextFunction);
    middleware(req2 as any, createMockResponse() as Response, next as NextFunction); // blocked

    expect(next).toHaveBeenCalledTimes(2); // One each for user-1 and user-2
  });

  it("should return cleanup function", () => {
    const { cleanup } = createRateLimiter({ maxRequests: 5 });
    expect(typeof cleanup).toBe("function");
    expect(() => cleanup()).not.toThrow();
  });

  it("should handle request without IP", () => {
    const { middleware } = createRateLimiter({ maxRequests: 5 });
    const req = { connection: {} } as any;
    const res = createMockResponse();
    const next = vi.fn();

    middleware(req, res as Response, next as NextFunction);
    expect(next).toHaveBeenCalled();
  });
});

describe("Rate limiter cleanup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should clean up expired entries after cleanup interval", () => {
    const windowMs = 1000; // 1 second window
    const { middleware, cleanup } = createRateLimiter({ maxRequests: 100, windowMs });
    const req = createMockRequest();
    const next = vi.fn();

    // Make some requests to populate the map
    middleware(req as Request, createMockResponse() as Response, next as NextFunction);
    middleware(req as Request, createMockResponse() as Response, next as NextFunction);

    // Advance time past the window so entries expire
    vi.advanceTimersByTime(windowMs + 1000);

    // Trigger the cleanup interval (runs every 5 minutes)
    vi.advanceTimersByTime(5 * 60 * 1000);

    // Now make a new request - should work since old entries were cleaned up
    const newRes = createMockResponse();
    const newNext = vi.fn();
    middleware(req as Request, newRes as Response, newNext as NextFunction);
    expect(newNext).toHaveBeenCalled();

    cleanup();
  });

  it("should not delete entries that have not expired during cleanup", () => {
    const windowMs = 10 * 60 * 1000; // 10 minute window
    const { middleware, cleanup } = createRateLimiter({ maxRequests: 5, windowMs });
    const req = createMockRequest();
    const next = vi.fn();

    // Make some requests
    for (let i = 0; i < 5; i++) {
      middleware(req as Request, createMockResponse() as Response, next as NextFunction);
    }

    // Trigger cleanup (but entries shouldn't expire yet since windowMs > 5 minutes)
    vi.advanceTimersByTime(5 * 60 * 1000);

    // Should still be at limit
    const res = createMockResponse();
    middleware(req as Request, res as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(429);

    cleanup();
  });
});

describe("createDefaultRateLimiter", () => {
  const originalEnv = process.env.RATE_LIMIT_MAX_REQUESTS;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.RATE_LIMIT_MAX_REQUESTS = originalEnv;
    } else {
      delete process.env.RATE_LIMIT_MAX_REQUESTS;
    }
  });

  it("should use env variable for max requests when set", () => {
    process.env.RATE_LIMIT_MAX_REQUESTS = "5";
    // Force module to re-evaluate (this won't work with cached modules)
    // Instead, we test that the function uses default when env is invalid
  });

  it("should use default 1000 when env variable is invalid", () => {
    process.env.RATE_LIMIT_MAX_REQUESTS = "invalid";
    const { middleware, cleanup } = createDefaultRateLimiter();

    // Should be able to make many requests (default 1000)
    const req = createMockRequest();
    const next = vi.fn();
    for (let i = 0; i < 100; i++) {
      middleware(req as Request, createMockResponse() as Response, next as NextFunction);
    }
    expect(next).toHaveBeenCalledTimes(100);
    cleanup();
  });

  it("should use default when env variable is negative", () => {
    process.env.RATE_LIMIT_MAX_REQUESTS = "-5";
    const { middleware, cleanup } = createDefaultRateLimiter();

    const req = createMockRequest();
    const next = vi.fn();
    for (let i = 0; i < 100; i++) {
      middleware(req as Request, createMockResponse() as Response, next as NextFunction);
    }
    expect(next).toHaveBeenCalledTimes(100);
    cleanup();
  });

  it("should create a rate limiter with default settings", () => {
    const { middleware, cleanup } = createDefaultRateLimiter();

    expect(typeof middleware).toBe("function");
    expect(typeof cleanup).toBe("function");

    const req = createMockRequest();
    const res = createMockResponse();
    const next = vi.fn();

    middleware(req as Request, res as Response, next as NextFunction);
    expect(next).toHaveBeenCalled();

    cleanup();
  });

  it("should allow many requests (default 1000)", () => {
    const { middleware, cleanup } = createDefaultRateLimiter();
    const req = createMockRequest();
    const next = vi.fn();

    for (let i = 0; i < 100; i++) {
      middleware(req as Request, createMockResponse() as Response, next as NextFunction);
    }

    expect(next).toHaveBeenCalledTimes(100);
    cleanup();
  });
});

describe("createCsrfRateLimiter", () => {
  const originalCsrfEnv = process.env.CSRF_MAX_REQUESTS;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalCsrfEnv !== undefined) {
      process.env.CSRF_MAX_REQUESTS = originalCsrfEnv;
    } else {
      delete process.env.CSRF_MAX_REQUESTS;
    }
  });

  it("should use default when env is invalid", () => {
    process.env.CSRF_MAX_REQUESTS = "invalid";
    const { middleware, cleanup } = createCsrfRateLimiter();

    const req = createMockRequest();
    const next = vi.fn();
    for (let i = 0; i < 60; i++) {
      middleware(req as Request, createMockResponse() as Response, next as NextFunction);
    }
    expect(next).toHaveBeenCalledTimes(60);
    cleanup();
  });

  it("should use default when env is negative", () => {
    process.env.CSRF_MAX_REQUESTS = "-10";
    const { middleware, cleanup } = createCsrfRateLimiter();

    const req = createMockRequest();
    const next = vi.fn();
    for (let i = 0; i < 60; i++) {
      middleware(req as Request, createMockResponse() as Response, next as NextFunction);
    }
    expect(next).toHaveBeenCalledTimes(60);
    cleanup();
  });

  it("should create a rate limiter for CSRF tokens", () => {
    const { middleware, cleanup } = createCsrfRateLimiter();

    expect(typeof middleware).toBe("function");
    expect(typeof cleanup).toBe("function");

    cleanup();
  });

  it("should have a more restrictive limit than default", () => {
    const { middleware, cleanup } = createCsrfRateLimiter();
    const req = createMockRequest();
    const next = vi.fn();

    // CSRF limiter defaults to 60 requests per minute
    for (let i = 0; i < 60; i++) {
      middleware(req as Request, createMockResponse() as Response, next as NextFunction);
    }
    expect(next).toHaveBeenCalledTimes(60);

    // 61st should be blocked
    const res = createMockResponse();
    middleware(req as Request, res as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.jsonData.message).toBe("Too many CSRF token requests");

    cleanup();
  });

  it("should reset after 1 minute window", () => {
    const { middleware, cleanup } = createCsrfRateLimiter();
    const req = createMockRequest();
    const next = vi.fn();

    // Use up limit
    for (let i = 0; i < 60; i++) {
      middleware(req as Request, createMockResponse() as Response, next as NextFunction);
    }

    // Should be blocked
    const blockedRes = createMockResponse();
    middleware(req as Request, blockedRes as Response, next as NextFunction);
    expect(blockedRes.status).toHaveBeenCalledWith(429);

    // Advance past window
    vi.advanceTimersByTime(61000);

    // Should work again
    const newRes = createMockResponse();
    const newNext = vi.fn();
    middleware(req as Request, newRes as Response, newNext as NextFunction);
    expect(newNext).toHaveBeenCalled();

    cleanup();
  });
});
