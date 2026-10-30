import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { StringValue } from "ms";
import { PrismaClient } from "../generated/client";
import { config } from "../config";
import { getTestPrisma, setupTestDb } from "./testUtils";

describe("Auth Enabled Toggle Authorization", () => {
  const userAgent = "vitest-auth-enabled";
  let prisma: PrismaClient;
  let app: any;
  let agent: any;
  let csrfHeaderName: string;
  let csrfToken: string;
  let regularUserToken: string;
  let adminUserToken: string;

  beforeAll(async () => {
    setupTestDb();
    prisma = getTestPrisma();

    ({ app } = await import("../index"));

    await prisma.systemConfig.upsert({
      where: { id: "default" },
      update: {
        authEnabled: true,
        registrationEnabled: false,
      },
      create: {
        id: "default",
        authEnabled: true,
        registrationEnabled: false,
      },
    });

    const passwordHash = await bcrypt.hash("password123", 10);
    const user = await prisma.user.create({
      data: {
        email: "regular-user@test.local",
        passwordHash,
        name: "Regular User",
        role: "USER",
        isActive: true,
      },
      select: {
        id: true,
        email: true,
      },
    });

    const signOptions: SignOptions = {
      expiresIn: config.jwtAccessExpiresIn as StringValue,
    };
    regularUserToken = jwt.sign(
      { userId: user.id, email: user.email, type: "access" },
      config.jwtSecret,
      signOptions,
    );

    const admin = await prisma.user.create({
      data: {
        email: "admin-user@test.local",
        passwordHash,
        name: "Admin User",
        role: "ADMIN",
        isActive: true,
      },
      select: {
        id: true,
        email: true,
      },
    });

    adminUserToken = jwt.sign(
      { userId: admin.id, email: admin.email, type: "access" },
      config.jwtSecret,
      signOptions,
    );

    agent = request.agent(app);
    const csrfRes = await agent.get("/csrf-token").set("User-Agent", userAgent);
    csrfHeaderName = csrfRes.body.header;
    csrfToken = csrfRes.body.token;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects unauthenticated auth-enabled toggle when auth is enabled", async () => {
    const response = await agent
      .post("/auth/auth-enabled")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .send({ enabled: false });

    expect(response.status).toBe(401);
  });

  it("rejects non-admin auth-enabled toggle", async () => {
    const response = await agent
      .post("/auth/auth-enabled")
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${regularUserToken}`)
      .set(csrfHeaderName, csrfToken)
      .send({ enabled: false });

    expect(response.status).toBe(403);
    expect(response.body?.message).toContain("Admin access required");
  });

  it("protects the bootstrap admin role through both admin endpoints", async () => {
    await prisma.user.upsert({
      where: { id: "bootstrap-admin" },
      update: { role: "ADMIN" },
      create: {
        id: "bootstrap-admin",
        email: "bootstrap@excalidash.local",
        passwordHash: "",
        name: "Bootstrap Admin",
        role: "ADMIN",
        isActive: false,
      },
    });
    const role = await agent
      .post("/auth/admins")
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${adminUserToken}`)
      .set(csrfHeaderName, csrfToken)
      .send({ identifier: "bootstrap@excalidash.local", role: "USER" });
    expect(role.status).toBe(409);
    expect(role.body.message).toContain("bootstrap account");
    const update = await agent
      .patch("/auth/users/bootstrap-admin")
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${adminUserToken}`)
      .set(csrfHeaderName, csrfToken)
      .send({ role: "USER" });
    expect(update.status).toBe(409);
    expect(update.body.message).toContain("bootstrap account");
    expect(
      (
        await prisma.user.findUniqueOrThrow({
          where: { id: "bootstrap-admin" },
        })
      ).role,
    ).toBe("ADMIN");
  });

  it("persists the compact sidebar preference without accepting unknown fields", async () => {
    const setPreference = (data: Record<string, unknown>) =>
      agent
        .put("/auth/preferences")
        .set("User-Agent", userAgent)
        .set("Authorization", `Bearer ${regularUserToken}`)
        .set(csrfHeaderName, csrfToken)
        .send(data);
    const updated = await setPreference({ compactSidebar: false });
    expect(updated.status).toBe(200);
    const fetched = await agent
      .get("/auth/preferences")
      .set("Authorization", `Bearer ${regularUserToken}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.preferences.compactSidebar).toBe(false);
    expect(
      (await setPreference({ compactSidebar: true, unknownPreference: true }))
        .status,
    ).toBe(400);
    expect((await setPreference({ compactSidebar: "false" })).status).toBe(400);
    expect((await setPreference({ theme: "system" })).status).toBe(200);
    expect((await setPreference({ theme: "auto" })).status).toBe(400);
    const withTheme = await agent
      .get("/auth/preferences")
      .set("Authorization", `Bearer ${regularUserToken}`);
    expect(withTheme.body.preferences.theme).toBe("system");
  });

  it("applies auth mode change immediately for subsequent requests", async () => {
    const warmStatusResponse = await request(app)
      .get("/auth/status")
      .set("User-Agent", userAgent);
    expect(warmStatusResponse.status).toBe(200);
    expect(warmStatusResponse.body?.authEnabled).toBe(true);

    const toggleResponse = await agent
      .post("/auth/auth-enabled")
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${adminUserToken}`)
      .set(csrfHeaderName, csrfToken)
      .send({ enabled: false });
    expect(toggleResponse.status).toBe(200);
    expect(toggleResponse.body?.authEnabled).toBe(false);

    const drawingsResponse = await request(app)
      .get("/drawings")
      .set("User-Agent", userAgent);
    expect(drawingsResponse.status).toBe(200);
    expect(Array.isArray(drawingsResponse.body?.drawings)).toBe(true);
  });
});
