import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "../generated/client";
import { getTestPrisma, setupTestDb } from "./testUtils";
import { BOOTSTRAP_USER_ID } from "../auth/authMode";
import { issueBootstrapSetupCodeIfRequired } from "../auth/bootstrapSetupCode";
import type { AuthMode } from "../config";

describe("Bootstrap setup code issuance by auth mode", () => {
  let prisma: PrismaClient;

  const ttlMs = 15 * 60 * 1000;

  const issue = (authMode: AuthMode) =>
    issueBootstrapSetupCodeIfRequired({
      prisma,
      ttlMs,
      authMode,
      reason: "startup",
    });

  // Mirrors a fresh install: the migrations create the SystemConfig row with
  // authEnabled = false and an inactive bootstrap-admin user, no active users.
  const resetToFreshInstall = async (authEnabled = false) => {
    await prisma.user.deleteMany({ where: { id: { not: BOOTSTRAP_USER_ID } } });
    await prisma.user.upsert({
      where: { id: BOOTSTRAP_USER_ID },
      update: { isActive: false },
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
      update: {
        authEnabled,
        bootstrapSetupCodeHash: null,
        bootstrapSetupCodeIssuedAt: null,
        bootstrapSetupCodeExpiresAt: null,
        bootstrapSetupCodeFailedAttempts: 0,
      },
      create: { id: "default", authEnabled },
    });
  };

  const addActiveAdmin = async () => {
    await prisma.user.create({
      data: {
        email: "admin@test.local",
        passwordHash: "x",
        name: "Admin",
        role: "ADMIN",
        isActive: true,
      },
    });
  };

  beforeAll(async () => {
    setupTestDb();
    prisma = getTestPrisma();
  });

  beforeEach(async () => {
    await resetToFreshInstall(false);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("issues a code in hybrid mode on a fresh database even though the stored authEnabled is false", async () => {
    const result = await issue("hybrid");
    expect(result.issued).toBe(true);
    expect(result.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const config = await prisma.systemConfig.findUnique({
      where: { id: "default" },
    });
    expect(config?.bootstrapSetupCodeHash).toBeTruthy();
    expect(config?.bootstrapSetupCodeExpiresAt).toBeInstanceOf(Date);
  });

  it("does not issue a code in hybrid mode once an active user exists", async () => {
    await addActiveAdmin();
    expect((await issue("hybrid")).issued).toBe(false);
  });

  it("does not issue a code in hybrid mode when the bootstrap user is already active", async () => {
    await prisma.user.update({
      where: { id: BOOTSTRAP_USER_ID },
      data: { isActive: true },
    });
    expect((await issue("hybrid")).issued).toBe(false);
  });

  it("keeps local mode gated on the runtime authEnabled toggle", async () => {
    expect((await issue("local")).issued).toBe(false);

    await resetToFreshInstall(true);
    expect((await issue("local")).issued).toBe(true);

    await resetToFreshInstall(true);
    await addActiveAdmin();
    expect((await issue("local")).issued).toBe(false);
  });

  it.each(["disabled", "oidc_enforced"] as const)(
    "never issues a code in %s mode",
    async (mode) => {
      expect((await issue(mode)).issued).toBe(false);

      await resetToFreshInstall(true);
      expect((await issue(mode)).issued).toBe(false);
    },
  );
});
