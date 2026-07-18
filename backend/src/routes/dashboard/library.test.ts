import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerLibraryRoutes } from "./library";

const createApp = (library: Record<string, unknown>) => {
  const app = express();
  app.use(express.json());
  registerLibraryRoutes(app, {
    prisma: { library } as any,
    requireAuth: ((req: any, _res: any, next: any) => {
      req.user = { id: "user-1" };
      next();
    }) as any,
    asyncHandler: ((handler: any) => (req: any, res: any, next: any) =>
      Promise.resolve(handler(req, res, next)).catch(next)) as any,
    parseJsonField: ((raw: string, fallback: unknown) => {
      try {
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    }) as any,
  } as any);
  return app;
};

describe("library optimistic concurrency", () => {
  it("updates only the expected version", async () => {
    const library = {
      findUnique: vi
        .fn()
        .mockResolvedValueOnce({ id: "user_user-1", items: "[]", version: 2 })
        .mockResolvedValueOnce({ id: "user_user-1", items: '[{"id":"a"}]', version: 3 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ id: "user_user-1", items: '[{"id":"a"}]', version: 3 }),
    };

    const response = await request(createApp(library))
      .put("/library")
      .send({ items: [{ id: "a" }], expectedVersion: 2 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [{ id: "a" }], version: 3 });
    expect(library.updateMany).toHaveBeenCalledWith({
      where: { id: "user_user-1", version: 2 },
      data: { items: '[{"id":"a"}]', version: { increment: 1 } },
    });
  });

  it("returns the current snapshot instead of overwriting a stale version", async () => {
    const library = {
      findUnique: vi
        .fn()
        .mockResolvedValueOnce({ id: "user_user-1", items: '[{"id":"old"}]', version: 2 })
        .mockResolvedValueOnce({ id: "user_user-1", items: '[{"id":"new"}]', version: 3 }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    };

    const response = await request(createApp(library))
      .put("/library")
      .send({ items: [], expectedVersion: 2 });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ items: [{ id: "new" }], version: 3 });
  });
});
