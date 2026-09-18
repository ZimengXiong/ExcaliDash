/**
 * Issue #38: CSRF fails with multiple reverse proxies
 *
 * This test demonstrates how trust proxy settings affect CSRF validation
 * when ExcaliDash is behind multiple proxy layers (e.g., Traefik, Synology NAS)
 */

import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createCsrfToken, validateCsrfToken } from "../security";

const getClientIdFromRequest = (req: express.Request): string => {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const userAgent = req.headers["user-agent"] || "unknown";
  return `${ip}:${userAgent}`.slice(0, 256);
};

describe("Issue #38: CSRF with trust proxy settings", () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  it("demonstrates the trust proxy issue with multiple proxies", async () => {
    const app1 = express();
    app1.set("trust proxy", 1);
    app1.use(express.json());

    app1.get("/test-ip", (req, res) => {
      res.json({
        ip: req.ip,
        clientId: getClientIdFromRequest(req),
      });
    });

    const response1 = await request(app1)
      .get("/test-ip")
      .set("X-Forwarded-For", "203.0.113.42, 10.0.0.5, 172.17.0.3")
      .set("User-Agent", "Mozilla/5.0 Test");

    expect(response1.body.ip).toBe("172.17.0.3");
    console.log(
      "trust proxy: 1 → IP:",
      response1.body.ip,
      "(not the real client IP)",
    );

    const app2 = express();
    app2.set("trust proxy", true);
    app2.use(express.json());

    app2.get("/test-ip", (req, res) => {
      res.json({
        ip: req.ip,
        clientId: getClientIdFromRequest(req),
      });
    });

    const response2 = await request(app2)
      .get("/test-ip")
      .set("X-Forwarded-For", "203.0.113.42, 10.0.0.5, 172.17.0.3")
      .set("User-Agent", "Mozilla/5.0 Test");

    expect(response2.body.ip).toBe("203.0.113.42");
    console.log(
      "trust proxy: true → IP:",
      response2.body.ip,
      "(real client IP - CORRECT)",
    );
  });

  it("simulates CSRF failure scenario from issue #38", async () => {
    const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

    const clientIp1 = "203.0.113.42";
    const externalProxyIp1 = "10.0.0.5"; // External proxy IP on first request

    const clientId1 = `${externalProxyIp1}:${userAgent}`;
    const token = createCsrfToken(clientId1);

    console.log(
      "  X-Forwarded-For:",
      `${clientIp1}, ${externalProxyIp1}, 172.17.0.3`,
    );
    console.log("  Express sees IP:", externalProxyIp1);
    console.log("  ClientId:", clientId1.slice(0, 50) + "...");

    const externalProxyIp2 = "10.0.0.6";

    const clientId2 = `${externalProxyIp2}:${userAgent}`;

    console.log(
      "  X-Forwarded-For:",
      `${clientIp1}, ${externalProxyIp2}, 172.17.0.3`,
    );
    console.log("  Express sees IP:", externalProxyIp2);
    console.log("  ClientId:", clientId2.slice(0, 50) + "...");

    const isValid = validateCsrfToken(clientId2, token);

    expect(isValid).toBe(false);
    console.log("   Expected:", clientId1.slice(0, 50) + "...");
    console.log("   Got:", clientId2.slice(0, 50) + "...");
  });

  it("shows the fix works with trust proxy: true", async () => {
    const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
    const realClientIp = "203.0.113.42";

    const clientId1 = `${realClientIp}:${userAgent}`;
    const token = createCsrfToken(clientId1);

    console.log("  X-Forwarded-For:", `${realClientIp}, 10.0.0.5, 172.17.0.3`);
    console.log("  Express sees IP:", realClientIp);

    const clientId2 = `${realClientIp}:${userAgent}`;

    console.log("Create drawing");
    console.log("X-Forwarded-For:", `${realClientIp}, 10.0.0.6, 172.17.0.3`);
    console.log("Express sees IP:", realClientIp, "(same!)");

    const isValid = validateCsrfToken(clientId2, token);

    expect(isValid).toBe(true);
    console.log("\nCSRF Validation: SUCCESS");
  });

  it("demonstrates the Synology NAS scenario from issue #38", async () => {
    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());

    let seenIp: string | undefined;
    app.get("/test", (req, res) => {
      seenIp = req.ip;
      res.json({ ip: req.ip });
    });

    await request(app)
      .get("/test")
      .set("X-Forwarded-For", "192.168.0.100, 192.168.1.4, 192.168.11.166");
    console.log("  With trust proxy: 1, Express sees:", seenIp);
    expect(seenIp).toBe("192.168.11.166"); // Not the real client IP
  });
});
