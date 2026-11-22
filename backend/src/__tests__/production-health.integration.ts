import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { setupTestDb } from "./testUtils";
import { startRuntimeServer } from "./runtimeServer";

describe("production health checks", () => {
  beforeAll(setupTestDb);

  it("serves loopback health checks without HTTPS redirects or onboarding", async () => {
    const server = await startRuntimeServer({
      ENFORCE_HTTPS_REDIRECT: "true",
      TRUST_PROXY: "1",
      FRONTEND_URL: "https://first.example.test,http://192.168.1.10:6767",
    });
    try {
      const health = await fetch(`${server.url}/health`, {
        redirect: "manual",
      });
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ status: "ok", database: "ok" });
      await request(server.url)
        .get("/drawings")
        .set("Host", "192.168.1.10")
        .expect(302)
        .expect("Location", "https://first.example.test/drawings");
      await request(server.url)
        .get("/drawings")
        .set("Host", "192.168.1.10:6767")
        .expect(409);
      const secure = await fetch(`${server.url}/drawings`, {
        headers: { "X-Forwarded-Proto": "https" },
        redirect: "manual",
      });
      expect(secure.status).toBe(409);
    } finally {
      await server.stop();
    }
  });

  it("reports unhealthy (503) when the database is actually broken", async () => {
    const server = await startRuntimeServer();
    try {
      expect((await fetch(`${server.url}/health`)).status).toBe(200);

      // Break the schema out from under the running server. A bare `SELECT 1`
      // never touches the database file, so it would keep reporting healthy.
      const Database = require("better-sqlite3") as any;
      const db = new Database(process.env.DATABASE_URL!.replace(/^file:/, ""));
      try {
        db.exec("DROP TABLE SystemConfig");
      } finally {
        db.close();
      }

      const health = await fetch(`${server.url}/health`);
      expect(health.status).toBe(503);
      expect(await health.json()).toEqual({
        status: "error",
        database: "unavailable",
      });
    } finally {
      await server.stop();
    }
  });
});
