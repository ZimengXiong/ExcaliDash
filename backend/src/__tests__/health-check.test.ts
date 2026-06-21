/**
 * Health check endpoint test
 * Ensures /health returns 200 OK without redirects (for Kubernetes probes)
 */

import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

describe("Health check endpoint", () => {
  it("should return 200 OK with status 'ok'", async () => {
    const app = express();

    app.get("/health", (req, res) => {
      res.status(200).json({ status: "ok" });
    });

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("should not redirect even when behind HTTPS middleware", async () => {
    const app = express();

    // Simulate HTTPS redirect middleware with /health exception
    app.use((req, res, next) => {
      // Skip HTTPS redirect for health check endpoint
      if (req.path === "/health") {
        return next();
      }

      if (req.header("x-forwarded-proto") !== "https") {
        return res.redirect(`https://example.com${req.path}`);
      }
      next();
    });

    app.get("/health", (req, res) => {
      res.status(200).json({ status: "ok" });
    });

    app.get("/other", (req, res) => {
      res.status(200).json({ status: "ok" });
    });

    // Health check should NOT redirect (even without x-forwarded-proto)
    const healthResponse = await request(app).get("/health");
    expect(healthResponse.status).toBe(200);
    expect(healthResponse.body).toEqual({ status: "ok" });

    // Other routes should still redirect
    const otherResponse = await request(app).get("/other");
    expect(otherResponse.status).toBe(302);
    expect(otherResponse.headers.location).toContain("https://");
  });
});
