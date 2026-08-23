/**
 * Verifies the raw file-upload endpoint rejects oversize bodies with an
 * actionable 413 JSON error. FILE_UPLOAD_MAX_MB is read at config-load time,
 * so this file sets a tiny cap and dynamically imports the route module
 * afterwards (a fresh module registry per test file lets config pick it up).
 */
import { describe, expect, it, beforeAll } from "vitest";
import express from "express";
import request from "supertest";

let app: express.Express;

beforeAll(async () => {
  // ~1 KB cap; set before the first import of ../config (transitively pulled
  // in by ./files).
  process.env.FILE_UPLOAD_MAX_MB = "0.001";
  const { registerFileRoutes } = await import("./files");

  app = express();
  registerFileRoutes(app, {
    prisma: {} as any,
    requireAuth: ((_req: any, _res: any, next: any) => next()) as any,
    optionalAuth: ((_req: any, _res: any, next: any) => next()) as any,
    asyncHandler: (<T>(fn: any) => (req: any, res: any, next: any) =>
      Promise.resolve(fn(req, res, next)).catch(next)) as any,
  });
});

describe("raw upload size limit", () => {
  it("returns 413 with an actionable JSON error when the body exceeds the cap", async () => {
    const oversized = Buffer.alloc(4000, 1); // > ~1 KB limit

    const res = await request(app)
      .put("/drawings/drawing-1/files/file-1")
      .set("Content-Type", "image/png")
      .send(oversized);

    expect(res.status).toBe(413);
    expect(res.body.error).toBe("File too large");
    expect(typeof res.body.message).toBe("string");
    expect(res.body.message).toContain("FILE_UPLOAD_MAX_MB");
  });
});
