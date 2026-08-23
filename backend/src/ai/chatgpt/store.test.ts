import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/client";
import {
  cleanupTestDb,
  getTestPrisma,
  initTestDb,
  setupTestDb,
} from "../../__tests__/testUtils";
import { encryptSecret } from "../crypto";

const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("./oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./oauth")>();
  return { ...actual, refreshTokens: refreshMock };
});
import {
  consumePendingAuth,
  ensureFreshAuth,
  savePendingAuth,
} from "./store";

describe("chatgpt connection store", () => {
  let prisma: PrismaClient;
  let userId: string;

  beforeAll(async () => {
    setupTestDb();
    prisma = getTestPrisma();
    const user = await initTestDb(prisma);
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanupTestDb(prisma);
    await prisma.chatGptAuthState.deleteMany({});
    await prisma.chatGptConnection.deleteMany({});
    refreshMock.mockReset();
  });

  it("keeps only the newest pending OAuth flow for a user and consumes it once", async () => {
    await savePendingAuth(prisma, {
      state: "old-state",
      userId,
      codeVerifier: "old-verifier",
    });
    await savePendingAuth(prisma, {
      state: "new-state",
      userId,
      codeVerifier: "new-verifier",
    });

    expect(await prisma.chatGptAuthState.count({ where: { userId } })).toBe(1);
    expect(await consumePendingAuth(prisma, "old-state")).toBeNull();
    expect(await consumePendingAuth(prisma, "new-state")).toEqual({
      userId,
      codeVerifier: "new-verifier",
    });
    expect(await consumePendingAuth(prisma, "new-state")).toBeNull();
  });

  it("coalesces concurrent refreshes for the same user", async () => {
    await prisma.chatGptConnection.create({
      data: {
        userId,
        accountId: "account-old",
        accessTokenEncrypted: encryptSecret("expired-access"),
        refreshTokenEncrypted: encryptSecret("refresh-token"),
        expiresAt: BigInt(0),
      },
    });

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    refreshMock.mockImplementation(async () => {
      await gate;
      return {
        accessToken: "fresh-access",
        refreshToken: "fresh-refresh",
        idToken: null,
        expiresAt: Date.now() + 60_000,
        accountId: "account-new",
        email: null,
        planType: "plus",
      };
    });

    const first = ensureFreshAuth(prisma, userId);
    const second = ensureFreshAuth(prisma, userId);
    release();
    const [a, b] = await Promise.all([first, second]);

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(a).toEqual({
      ok: true,
      auth: { accessToken: "fresh-access", accountId: "account-new" },
    });
  });
});
