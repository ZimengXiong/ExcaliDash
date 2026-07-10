/**
 * Focused unit tests for the version-conditional writes in the storage
 * routes (B14 lost-update fix). A fake Prisma lets us drive the exact
 * updateMany result — count 0 (a concurrent editor moved the version) must
 * yield 409 VERSION_CONFLICT instead of clobbering the newer state, and the
 * guard must key on the version that was read.
 */
import express from "express";
import request from "supertest";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { registerStorageRoutes } from "./storage";

const parseJsonField = <T>(raw: string | null | undefined, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const buildApp = (opts: {
  drawing: { id: string; name: string; version: number; elements: string; files: string };
  updateCount: number;
}) => {
  const updateMany = vi.fn().mockResolvedValue({ count: opts.updateCount });
  const prisma = {
    drawing: {
      findFirst: vi.fn().mockResolvedValue({
        userId: "u1",
        collectionId: null,
        ...opts.drawing,
      }),
      updateMany,
    },
    drawingFile: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn(),
    },
  } as any;

  const app = express();
  app.use(express.json());
  registerStorageRoutes(app, {
    prisma,
    requireAuth: ((req: any, _res: any, next: any) => {
      req.user = { id: "u1" };
      next();
    }) as any,
    asyncHandler: (<T>(fn: any) => (req: any, res: any, next: any) =>
      Promise.resolve(fn(req, res, next)).catch(next)) as any,
    parseJsonField,
    invalidateDrawingsCache: vi.fn(),
    io: { to: () => ({ emit: () => undefined }) } as any,
  });
  return { app, updateMany };
};

describe("storage routes version-conditional writes", () => {
  beforeEach(() => vi.restoreAllMocks());

  const drawing = {
    id: "d1",
    name: "Doc",
    version: 5,
    elements: JSON.stringify([]),
    files: JSON.stringify({ f1: { id: "f1", mimeType: "image/png" } }),
  };

  it("trim returns 409 VERSION_CONFLICT when the version moved (updateMany matched 0 rows)", async () => {
    const { app, updateMany } = buildApp({ drawing, updateCount: 0 });

    const res = await request(app)
      .post("/drawings/d1/trim")
      .send({ confirmName: "Doc" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("VERSION_CONFLICT");
    // Guard keys on the version that was read, not an unconditional update.
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "d1", version: 5 } }),
    );
  });

  it("trim succeeds and bumps the version when updateMany matches", async () => {
    const { app, updateMany } = buildApp({ drawing, updateCount: 1 });

    const res = await request(app)
      .post("/drawings/d1/trim")
      .send({ confirmName: "Doc" });

    expect(res.status).toBe(200);
    expect(res.body.trimmed).toMatchObject({ filesRemoved: 1 });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d1", version: 5 },
        data: expect.objectContaining({ version: { increment: 1 } }),
      }),
    );
  });

  it("orphan delete returns 409 VERSION_CONFLICT when the version moved", async () => {
    const { app } = buildApp({ drawing, updateCount: 0 });

    const res = await request(app)
      .delete("/drawings/d1/files/orphans")
      .send({ confirmName: "Doc", fileIds: ["f1"] });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("VERSION_CONFLICT");
  });
});
