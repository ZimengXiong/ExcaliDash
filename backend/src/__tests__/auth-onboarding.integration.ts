import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { PrismaClient } from "../generated/client";
import { getTestPrisma, setupTestDb } from "./testUtils";
import { BOOTSTRAP_USER_ID } from "../auth/authMode";
import { issueBootstrapSetupCodeIfRequired } from "../auth/bootstrapSetupCode";

describe("Auth onboarding decision", () => {
  const userAgent = "vitest-auth-onboarding";
  let prisma: PrismaClient;
  let app: any;
  let agent: any;
  let csrfHeaderName: string;
  let csrfToken: string;

  beforeAll(async () => {
    await setupTestDb();
    prisma = getTestPrisma();

    ({ app } = await import("../index"));

    agent = request.agent(app);
    const csrfRes = await agent.get("/csrf-token").set("User-Agent", userAgent);
    csrfHeaderName = csrfRes.body.header;
    csrfToken = csrfRes.body.token;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("reports migration onboarding mode when no active users and legacy data exists", async () => {
    await prisma.user.upsert({
      where: { id: BOOTSTRAP_USER_ID },
      update: {},
      create: {
        id: BOOTSTRAP_USER_ID,
        email: "bootstrap@excalidash.local",
        username: null,
        passwordHash: "",
        name: "Bootstrap Admin",
        role: "ADMIN",
        mustResetPassword: true,
        isActive: false,
      },
    });

    await prisma.systemConfig.upsert({
      where: { id: "default" },
      update: { authEnabled: false, authOnboardingCompleted: false },
      create: {
        id: "default",
        authEnabled: false,
        authOnboardingCompleted: false,
        registrationEnabled: false,
      },
    });

    await prisma.collection.upsert({
      where: { id: "legacy-collection" },
      update: {},
      create: {
        id: "legacy-collection",
        name: "Legacy",
        userId: BOOTSTRAP_USER_ID,
      },
    });

    await prisma.drawing.upsert({
      where: { id: "legacy-drawing" },
      update: {},
      create: {
        id: "legacy-drawing",
        name: "Legacy Drawing",
        elements: "[]",
        appState: "{}",
        files: "{}",
        userId: BOOTSTRAP_USER_ID,
        collectionId: "legacy-collection",
      },
    });

    const response = await request(app).get("/auth/status").set("User-Agent", userAgent);

    expect(response.status).toBe(200);
    expect(response.body?.authEnabled).toBe(false);
    expect(response.body?.authOnboardingRequired).toBe(true);
    expect(response.body?.authOnboardingMode).toBe("migration");
  });

  it("persists a single-user onboarding choice", async () => {
    await prisma.systemConfig.update({
      where: { id: "default" },
      data: { authEnabled: false, authOnboardingCompleted: false },
    });

    const choiceResponse = await agent
      .post("/auth/onboarding-choice")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .send({ enableAuth: false });

    expect(choiceResponse.status).toBe(200);
    expect(choiceResponse.body?.authEnabled).toBe(false);
    expect(choiceResponse.body?.authOnboardingCompleted).toBe(true);

    const statusResponse = await request(app).get("/auth/status").set("User-Agent", userAgent);
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body?.authOnboardingRequired).toBe(false);
  });

  it("enables auth and bootstrap flow from onboarding choice", async () => {
    await prisma.drawing.deleteMany({});
    await prisma.collection.deleteMany({ where: { id: { not: `trash:${BOOTSTRAP_USER_ID}` } } });
    await prisma.systemConfig.update({
      where: { id: "default" },
      data: { authEnabled: false, authOnboardingCompleted: false },
    });

    const choiceResponse = await agent
      .post("/auth/onboarding-choice")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .send({ enableAuth: true });

    expect(choiceResponse.status).toBe(200);
    expect(choiceResponse.body?.authEnabled).toBe(true);
    expect(choiceResponse.body?.bootstrapRequired).toBe(true);
    expect(choiceResponse.body?.authOnboardingCompleted).toBe(true);

    const statusResponse = await request(app).get("/auth/status").set("User-Agent", userAgent);
    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body?.authEnabled).toBe(true);
    expect(statusResponse.body?.bootstrapRequired).toBe(true);
    expect(statusResponse.body?.authOnboardingRequired).toBe(false);
  });

  it("requires CSRF token for bootstrap registration", async () => {
    const noCsrfResponse = await agent
      .post("/auth/register")
      .set("User-Agent", userAgent)
      .send({
        email: "bootstrap-admin@test.local",
        password: "StrongPass1!",
        name: "Bootstrap Admin",
      });

    expect(noCsrfResponse.status).toBe(403);
    expect(noCsrfResponse.body?.error).toBe("CSRF token missing");

    const issued = await issueBootstrapSetupCodeIfRequired({
      prisma,
      ttlMs: 15 * 60 * 1000,
      authMode: "local",
      reason: "bootstrap_register_reissue",
    });
    expect(issued.issued).toBe(true);
    expect(issued.code).toBeTruthy();

    const bootstrapResponse = await agent
      .post("/auth/register")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .send({
        email: "bootstrap-admin@test.local",
        password: "StrongPass1!",
        name: "Bootstrap Admin",
        setupCode: issued.code,
      });

    expect(bootstrapResponse.status).toBe(201);
    expect(bootstrapResponse.body?.bootstrapped).toBe(true);
    expect(bootstrapResponse.body?.user?.email).toBe("bootstrap-admin@test.local");
    expect(bootstrapResponse.body?.accessToken).toBeUndefined();
    expect(bootstrapResponse.body?.refreshToken).toBeUndefined();
  });

  it("requires CSRF token for login and does not expose tokens in response body", async () => {
    const noCsrfResponse = await agent
      .post("/auth/login")
      .set("User-Agent", userAgent)
      .send({
        email: "bootstrap-admin@test.local",
        password: "StrongPass1!",
      });

    expect(noCsrfResponse.status).toBe(403);
    expect(noCsrfResponse.body?.error).toBe("CSRF token missing");

    const loginResponse = await agent
      .post("/auth/login")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .send({
        email: "bootstrap-admin@test.local",
        password: "StrongPass1!",
      });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body?.user?.email).toBe("bootstrap-admin@test.local");
    expect(loginResponse.body?.accessToken).toBeUndefined();
    expect(loginResponse.body?.refreshToken).toBeUndefined();
  });
});
