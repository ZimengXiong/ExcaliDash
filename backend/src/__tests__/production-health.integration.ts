import { beforeAll, describe, expect, it } from "vitest";
import { setupTestDb } from "./testUtils";
import { startRuntimeServer } from "./runtimeServer";

describe("production health checks", () => {
  beforeAll(setupTestDb);

  it("serves loopback health checks without HTTPS redirects or onboarding", async () => {
    const server = await startRuntimeServer({
      ENFORCE_HTTPS_REDIRECT: "true",
      TRUST_PROXY: "1",
    });
    try {
      const health = await fetch(`${server.url}/health`, {
        redirect: "manual",
      });
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ status: "ok", database: "ok" });
      const gated = await fetch(`${server.url}/drawings`, {
        redirect: "manual",
      });
      expect(gated.status).toBe(302);
      const secure = await fetch(`${server.url}/drawings`, {
        headers: { "X-Forwarded-Proto": "https" },
        redirect: "manual",
      });
      expect(secure.status).toBe(409);
    } finally {
      await server.stop();
    }
  });
});
