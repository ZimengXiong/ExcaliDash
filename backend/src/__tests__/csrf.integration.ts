/**
 * CSRF Tests - Horizontal Scaling (K8s) Validation
 *
 * PR #20 review concern:
 * "Worried that in memory token store might not work on horizontal scaling"
 *
 * Fix:
 * - CSRF tokens are now stateless and HMAC-signed using a shared `CSRF_SECRET`.
 * - Any pod can validate any token as long as all pods share the same secret.
 *
 * These tests prove:
 * - Tokens validate correctly for the issuing client id
 * - Tokens do NOT validate for a different client id
 * - Tokens expire after 24 hours
 * - Tokens validate across separate module instances (simulated pods)
 */

import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";

const SHARED_SECRET = "test-shared-csrf-secret";

beforeAll(() => {
  // Must be shared across instances/pods for horizontal scaling.
  process.env.CSRF_SECRET = SHARED_SECRET;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CSRF - stateless HMAC tokens", () => {
  it("creates a token in payload.signature format and validates for same client id", async () => {
    const { createCsrfToken, validateCsrfToken } = await import("../security");

    const clientId = "test-client-1";
    const token = createCsrfToken(clientId);

    expect(typeof token).toBe("string");
    // base64url(payload).base64url(signature)
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(validateCsrfToken(clientId, token)).toBe(true);
  });

  it("rejects validation for a different client id (token binding)", async () => {
    const { createCsrfToken, validateCsrfToken } = await import("../security");

    const token = createCsrfToken("client-a");
    expect(validateCsrfToken("client-b", token)).toBe(false);
  });

  it("rejects malformed tokens", async () => {
    const { validateCsrfToken } = await import("../security");

    expect(validateCsrfToken("client", "not-a-token")).toBe(false);
    expect(validateCsrfToken("client", "a.b.c")).toBe(false);
    expect(validateCsrfToken("client", "")).toBe(false);
  });

  it("revokeCsrfToken is a no-op for stateless tokens (does not break callers)", async () => {
    const { createCsrfToken, validateCsrfToken, revokeCsrfToken } = await import(
      "../security"
    );

    const clientId = "client-revoke";
    const token = createCsrfToken(clientId);

    expect(validateCsrfToken(clientId, token)).toBe(true);
    revokeCsrfToken(clientId);
    // Stateless token remains valid until expiry
    expect(validateCsrfToken(clientId, token)).toBe(true);
  });

  it("expires tokens after 24 hours", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));

    const { createCsrfToken, validateCsrfToken } = await import("../security");

    const clientId = "client-expiry";
    const token = createCsrfToken(clientId);
    expect(validateCsrfToken(clientId, token)).toBe(true);

    // 24h + 1ms later
    vi.setSystemTime(new Date("2025-01-02T00:00:00.001Z"));
    expect(validateCsrfToken(clientId, token)).toBe(false);
  });
});

describe("CSRF - horizontal scaling (simulated pods)", () => {
  it("validates across module instances (pod A issues, pod B validates)", async () => {
    const clientId = "user-123";

    vi.resetModules();
    const podA = await import("../security");
    const token = podA.createCsrfToken(clientId);

    // Simulate a different pod (new Node.js process / fresh module state)
    vi.resetModules();
    const podB = await import("../security");

    expect(podB.validateCsrfToken(clientId, token)).toBe(true);
  });

  it("has 0% failure rate under round-robin validation across 3 pods", async () => {
    const clientId = "user-round-robin";

    const pods: Array<{
      createCsrfToken: (clientId: string) => string;
      validateCsrfToken: (clientId: string, token: string) => boolean;
    }> = [];

    for (let i = 0; i < 3; i++) {
      vi.resetModules();
      pods.push(await import("../security"));
    }

    // Token issued on one pod
    const token = pods[0].createCsrfToken(clientId);

    // Validate on alternating pods (simulates a non-sticky load balancer)
    const attempts = 60;
    let failures = 0;

    for (let i = 0; i < attempts; i++) {
      const pod = pods[i % pods.length];
      if (!pod.validateCsrfToken(clientId, token)) failures++;
    }

    expect(failures).toBe(0);
  });
});

describe("CSRF - referer origin parsing", () => {
  it("extracts exact origin from a referer URL", async () => {
    const { getOriginFromReferer } = await import("../security");

    expect(getOriginFromReferer("https://example.com/path?x=1")).toBe(
      "https://example.com"
    );
    expect(getOriginFromReferer("http://localhost:5173/some/page")).toBe(
      "http://localhost:5173"
    );
  });

  it("does not allow prefix tricks (origin must be parsed)", async () => {
    const { getOriginFromReferer } = await import("../security");

    expect(
      getOriginFromReferer("https://example.com.evil.com/anything")
    ).toBe("https://example.com.evil.com");

    // `startsWith("https://example.com")` would incorrectly allow this.
    expect(getOriginFromReferer("https://example.com@evil.com/anything")).toBe(
      "https://evil.com"
    );
  });

  it("returns null for invalid or non-http(s) referers", async () => {
    const { getOriginFromReferer } = await import("../security");

    expect(getOriginFromReferer("")).toBeNull();
    expect(getOriginFromReferer("not a url")).toBeNull();
    expect(getOriginFromReferer("file:///etc/passwd")).toBeNull();
    expect(getOriginFromReferer(null)).toBeNull();
  });
});


