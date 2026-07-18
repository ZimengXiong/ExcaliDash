import { Prisma } from "../../generated/client";
import { describe, expect, it, vi } from "vitest";
import { consumePendingAuth } from "./store";

const row = (createdAt = new Date()) => ({
  userId: "user-1",
  codeVerifier: "verifier",
  createdAt,
});

describe("consumePendingAuth", () => {
  it("atomically gives a pending state to only one concurrent consumer", async () => {
    const deleteState = vi.fn()
      .mockResolvedValueOnce(row())
      .mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("missing", {
        code: "P2025",
        clientVersion: "test",
      }));
    const prisma = { chatGptAuthState: { delete: deleteState } } as any;

    await expect(Promise.all([
      consumePendingAuth(prisma, "state"),
      consumePendingAuth(prisma, "state"),
    ])).resolves.toEqual([{ userId: "user-1", codeVerifier: "verifier" }, null]);
    expect(deleteState).toHaveBeenCalledTimes(2);
  });

  it("returns null for an unknown state", async () => {
    const prisma = { chatGptAuthState: { delete: vi.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("missing", { code: "P2025", clientVersion: "test" }),
    ) } } as any;

    await expect(consumePendingAuth(prisma, "unknown")).resolves.toBeNull();
  });

  it("consumes but rejects an expired state", async () => {
    const prisma = { chatGptAuthState: { delete: vi.fn().mockResolvedValue(
      row(new Date(Date.now() - 10 * 60 * 1000 - 1)),
    ) } } as any;

    await expect(consumePendingAuth(prisma, "expired")).resolves.toBeNull();
  });
});
