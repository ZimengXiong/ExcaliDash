/**
 * Tests for middleware/securityHeaders.ts
 */
import { describe, it, expect, vi } from "vitest";
import { securityHeadersMiddleware } from "../middleware/securityHeaders";
import type { Request, Response, NextFunction } from "express";

describe("securityHeadersMiddleware", () => {
  const createMockResponse = () => {
    const headers: Record<string, string> = {};
    return {
      setHeader: vi.fn((name: string, value: string) => {
        headers[name] = value;
      }),
      getHeaders: () => headers,
    };
  };

  it("should set X-Content-Type-Options header", () => {
    const res = createMockResponse();
    const next = vi.fn();

    securityHeadersMiddleware({} as Request, res as unknown as Response, next as NextFunction);

    expect(res.setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
  });

  it("should set X-Frame-Options header to DENY", () => {
    const res = createMockResponse();
    const next = vi.fn();

    securityHeadersMiddleware({} as Request, res as unknown as Response, next as NextFunction);

    expect(res.setHeader).toHaveBeenCalledWith("X-Frame-Options", "DENY");
  });

  it("should set X-XSS-Protection header", () => {
    const res = createMockResponse();
    const next = vi.fn();

    securityHeadersMiddleware({} as Request, res as unknown as Response, next as NextFunction);

    expect(res.setHeader).toHaveBeenCalledWith("X-XSS-Protection", "1; mode=block");
  });

  it("should set Referrer-Policy header", () => {
    const res = createMockResponse();
    const next = vi.fn();

    securityHeadersMiddleware({} as Request, res as unknown as Response, next as NextFunction);

    expect(res.setHeader).toHaveBeenCalledWith("Referrer-Policy", "strict-origin-when-cross-origin");
  });

  it("should set Permissions-Policy header", () => {
    const res = createMockResponse();
    const next = vi.fn();

    securityHeadersMiddleware({} as Request, res as unknown as Response, next as NextFunction);

    expect(res.setHeader).toHaveBeenCalledWith(
      "Permissions-Policy",
      "geolocation=(), microphone=(), camera=()"
    );
  });

  it("should set Content-Security-Policy header", () => {
    const res = createMockResponse();
    const next = vi.fn();

    securityHeadersMiddleware({} as Request, res as unknown as Response, next as NextFunction);

    const cspCall = res.setHeader.mock.calls.find(
      ([name]: [string]) => name === "Content-Security-Policy"
    );
    expect(cspCall).toBeDefined();

    const cspValue = cspCall![1] as string;
    expect(cspValue).toContain("default-src 'self'");
    expect(cspValue).toContain("script-src");
    expect(cspValue).toContain("style-src");
    expect(cspValue).toContain("font-src");
    expect(cspValue).toContain("img-src");
    expect(cspValue).toContain("connect-src");
    expect(cspValue).toContain("frame-ancestors 'none'");
  });

  it("should call next() after setting headers", () => {
    const res = createMockResponse();
    const next = vi.fn();

    securityHeadersMiddleware({} as Request, res as unknown as Response, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it("should set all 6 security headers", () => {
    const res = createMockResponse();
    const next = vi.fn();

    securityHeadersMiddleware({} as Request, res as unknown as Response, next as NextFunction);

    expect(res.setHeader).toHaveBeenCalledTimes(6);
  });

  it("should allow websocket connections in CSP", () => {
    const res = createMockResponse();
    const next = vi.fn();

    securityHeadersMiddleware({} as Request, res as unknown as Response, next as NextFunction);

    const cspCall = res.setHeader.mock.calls.find(
      ([name]: [string]) => name === "Content-Security-Policy"
    );
    const cspValue = cspCall![1] as string;
    expect(cspValue).toContain("ws:");
    expect(cspValue).toContain("wss:");
  });

  it("should allow data: and blob: for images in CSP", () => {
    const res = createMockResponse();
    const next = vi.fn();

    securityHeadersMiddleware({} as Request, res as unknown as Response, next as NextFunction);

    const cspCall = res.setHeader.mock.calls.find(
      ([name]: [string]) => name === "Content-Security-Policy"
    );
    const cspValue = cspCall![1] as string;
    expect(cspValue).toContain("img-src 'self' data: blob:");
  });

  it("should allow Google Fonts in CSP", () => {
    const res = createMockResponse();
    const next = vi.fn();

    securityHeadersMiddleware({} as Request, res as unknown as Response, next as NextFunction);

    const cspCall = res.setHeader.mock.calls.find(
      ([name]: [string]) => name === "Content-Security-Policy"
    );
    const cspValue = cspCall![1] as string;
    expect(cspValue).toContain("fonts.googleapis.com");
    expect(cspValue).toContain("fonts.gstatic.com");
  });
});
