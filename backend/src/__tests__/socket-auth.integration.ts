import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { PrismaClient } from "../generated/client";
import { createAuthModeService, BOOTSTRAP_USER_ID } from "../auth/authMode";
import { generateApiKey, serializeApiKeyScopes } from "../auth/apiKeys";
import { createSocketAuthResolver } from "../server/socketAuth";
import { getTestPrisma, setupTestDb } from "./testUtils";

const JWT_SECRET = "socket-auth-test-secret";

describe("Socket.IO handshake authentication", () => {
  let prisma: PrismaClient;
  let resolve: ReturnType<typeof createSocketAuthResolver>;
  let userId: string;

  const createKey = async (
    data: {
      scopes?: readonly string[];
      revokedAt?: Date;
      drawingId?: string;
      ownerId?: string;
    } = {},
  ) => {
    const generated = generateApiKey();
    const apiKey = await prisma.apiKey.create({
      data: {
        userId: data.ownerId ?? userId,
        name: "socket test",
        keyId: generated.keyId,
        tokenHash: generated.tokenHash,
        prefix: generated.prefix,
        scopes: serializeApiKeyScopes(data.scopes),
        revokedAt: data.revokedAt,
        drawingId: data.drawingId,
      },
      select: { id: true },
    });
    return { id: apiKey.id, token: generated.token };
  };

  const createUser = (
    email: string,
    data: { isActive?: boolean; mustResetPassword?: boolean } = {},
  ) =>
    prisma.user.create({
      data: {
        email,
        passwordHash: "unused",
        name: email,
        isActive: data.isActive ?? true,
        mustResetPassword: data.mustResetPassword ?? false,
      },
      select: { id: true },
    });

  const setAuthEnabled = (authEnabled: boolean) =>
    prisma.systemConfig.upsert({
      where: { id: "default" },
      update: { authEnabled },
      create: { id: "default", authEnabled },
    });

  beforeAll(async () => {
    setupTestDb();
    prisma = getTestPrisma();
    resolve = createSocketAuthResolver({
      prisma,
      // no cache, so tests can flip the auth toggle
      authModeService: createAuthModeService(prisma, { authEnabledTtlMs: 0 }),
      jwtSecret: JWT_SECRET,
    });
    userId = (await createUser("socket-key-user@test.local")).id;
  });

  beforeEach(async () => {
    await setAuthEnabled(true);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("resolves an API key to its user and records the use", async () => {
    const key = await createKey();

    const auth = await resolve(key.token);

    expect(auth?.userId).toBe(userId);
    expect(auth?.apiKeyScopes).toContain("drawings:write");
    const stored = await prisma.apiKey.findUnique({ where: { id: key.id } });
    expect(stored?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("keeps the scopes of a read-only key so edits can be refused", async () => {
    const key = await createKey({ scopes: ["drawings:read"] });

    const auth = await resolve(key.token);

    expect(auth?.userId).toBe(userId);
    expect(auth?.apiKeyScopes).toEqual(["drawings:read"]);
  });

  it("refuses keys without drawings:read", async () => {
    const key = await createKey({ scopes: ["collections:read"] });

    expect(await resolve(key.token)).toBeNull();
  });

  it("refuses revoked and unknown keys", async () => {
    const revoked = await createKey({ revokedAt: new Date() });

    expect(await resolve(revoked.token)).toBeNull();
    expect(await resolve("exd_invalid_invalid")).toBeNull();
  });

  it("refuses legacy drawing-scoped keys", async () => {
    const drawing = await prisma.drawing.create({
      data: { name: "Legacy", userId, elements: "[]", appState: "{}" },
    });
    const key = await createKey({ drawingId: drawing.id });

    expect(await resolve(key.token)).toBeNull();
  });

  it("refuses keys of inactive users and of users who must reset their password", async () => {
    const inactive = await createUser("socket-inactive@test.local", {
      isActive: false,
    });
    const mustReset = await createUser("socket-must-reset@test.local", {
      mustResetPassword: true,
    });
    const inactiveKey = await createKey({ ownerId: inactive.id });
    const mustResetKey = await createKey({ ownerId: mustReset.id });

    expect(await resolve(inactiveKey.token)).toBeNull();
    expect(await resolve(mustResetKey.token)).toBeNull();
  });

  it("still resolves JWT access tokens without scopes", async () => {
    const token = jwt.sign(
      { userId, email: "socket-key-user@test.local", type: "access" },
      JWT_SECRET,
    );

    expect(await resolve(token)).toEqual({ userId, apiKeyScopes: null });
    expect(await resolve(undefined)).toBeNull();
  });

  it("uses the bootstrap user when auth is disabled", async () => {
    await setAuthEnabled(false);

    expect(await resolve(undefined)).toEqual({
      userId: BOOTSTRAP_USER_ID,
      apiKeyScopes: null,
    });
  });
});
