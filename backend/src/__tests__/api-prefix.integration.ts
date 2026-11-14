import { beforeAll, describe, expect, it } from "vitest";
import { setupTestDb } from "./testUtils";
import { startRuntimeServer } from "./runtimeServer";

describe("api path prefix", () => {
  beforeAll(setupTestDb);

  it("serves routes with or without a leading /api", async () => {
    const server = await startRuntimeServer({
      ENFORCE_HTTPS_REDIRECT: "false",
    });
    try {
      for (const path of ["/health", "/api/health", "/api/health?x=1"]) {
        const res = await fetch(`${server.url}${path}`, { redirect: "manual" });
        expect(res.status, path).toBe(200);
        expect(await res.json()).toEqual({ status: "ok", database: "ok" });
      }
      const bare = await fetch(`${server.url}/auth/status`, {
        redirect: "manual",
      });
      const prefixed = await fetch(`${server.url}/api/auth/status`, {
        redirect: "manual",
      });
      expect(prefixed.status).toBe(bare.status);
      expect(await prefixed.json()).toEqual(await bare.json());
    } finally {
      await server.stop();
    }
  });

  it("does not strip look-alike prefixes", async () => {
    const server = await startRuntimeServer({
      ENFORCE_HTTPS_REDIRECT: "false",
    });
    try {
      const res = await fetch(`${server.url}/apihealth`, {
        redirect: "manual",
      });
      expect(res.status).not.toBe(200);
    } finally {
      await server.stop();
    }
  });
});
