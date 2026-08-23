import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { registerDrawingRoutes } from "../routes/dashboard/drawings";
import { createDrawingsCacheStore } from "../server/drawingsCache";

/**
 * Batch D (B6): /api/drawings list + preview + cache.
 * - list responses are always bounded (server-side default page size, take set)
 * - previews are no longer inlined in list responses
 * - GET /drawings/:id/preview serves an ETag-cacheable per-drawing preview
 */

const MOCK_USER_ID = "user-1";
const MOCK_DRAWING_ID = "drawing-1";

const summaryRow = (id: string) => ({
  id,
  name: `Drawing ${id}`,
  collectionId: null,
  version: 1,
  createdAt: new Date("2026-05-01T00:00:00Z"),
  updatedAt: new Date("2026-05-02T00:00:00Z"),
  user: { id: MOCK_USER_ID, name: "Owner" },
});

function buildApp() {
  const prisma = {
    drawing: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    drawingSnapshot: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    drawingPermission: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    drawingLinkShare: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    collection: { findFirst: vi.fn() },
    collectionShare: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
  } as any;

  const cache = createDrawingsCacheStore(10_000);

  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.user = { id: MOCK_USER_ID, role: "USER" };
    next();
  });

  registerDrawingRoutes(app, {
    prisma,
    requireAuth: (_req: any, _res: any, next: any) => next(),
    optionalAuth: (_req: any, _res: any, next: any) => next(),
    asyncHandler:
      (fn: any) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
    parseJsonField: (val: string, fallback: any) => {
      try {
        return JSON.parse(val);
      } catch {
        return fallback;
      }
    },
    sanitizeText: (input: unknown) => String(input ?? ""),
    validateImportedDrawing: vi.fn().mockReturnValue(true),
    drawingCreateSchema: { safeParse: vi.fn() } as any,
    drawingUpdateSchema: { safeParse: vi.fn() } as any,
    respondWithValidationErrors: vi.fn(),
    collectionNameSchema: { safeParse: vi.fn() } as any,
    ensureTrashCollection: vi.fn(),
    invalidateDrawingsCache: cache.invalidateDrawingsCache,
    buildDrawingsCacheKey: cache.buildDrawingsCacheKey,
    getCachedDrawingsBody: cache.getCachedDrawingsBody,
    cacheDrawingsResponse: cache.cacheDrawingsResponse,
    MAX_PAGE_SIZE: 200,
    config: { nodeEnv: "test", enableAuditLogging: false },
    logAuditEvent: vi.fn(),
  } as any);

  return { app, prisma };
}

describe("GET /drawings (list bounding + preview exclusion)", () => {
  let app: express.Express;
  let prisma: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    ({ app, prisma } = buildApp());
  });

  it("always sets a bounded take even when limit is omitted", async () => {
    prisma.drawing.findMany.mockResolvedValue([summaryRow("d1")]);
    prisma.drawing.count.mockResolvedValue(1);

    const res = await request(app).get("/drawings");

    expect(res.status).toBe(200);
    const args = prisma.drawing.findMany.mock.calls[0][0];
    expect(args.take).toBe(50);
    expect(args.skip).toBe(0);
    expect(res.body.limit).toBe(50);
  });

  it("clamps an oversized limit to MAX_PAGE_SIZE", async () => {
    prisma.drawing.findMany.mockResolvedValue([]);
    prisma.drawing.count.mockResolvedValue(0);

    await request(app).get("/drawings?limit=99999");

    const args = prisma.drawing.findMany.mock.calls[0][0];
    expect(args.take).toBe(200);
  });

  it("does not select or return inline previews", async () => {
    prisma.drawing.findMany.mockResolvedValue([summaryRow("d1")]);
    prisma.drawing.count.mockResolvedValue(1);

    const res = await request(app).get("/drawings?includePreview=true");

    const args = prisma.drawing.findMany.mock.calls[0][0];
    expect(args.select).toBeDefined();
    expect(args.select.preview).toBeUndefined();
    expect(res.body.drawings[0]).not.toHaveProperty("preview");
  });

  it("serves a cache HIT on the second identical request", async () => {
    prisma.drawing.findMany.mockResolvedValue([summaryRow("d1")]);
    prisma.drawing.count.mockResolvedValue(1);

    const first = await request(app).get("/drawings");
    expect(first.headers["x-cache"]).toBe("MISS");
    const second = await request(app).get("/drawings");
    expect(second.headers["x-cache"]).toBe("HIT");
    // Second request served from cache, no extra DB read.
    expect(prisma.drawing.findMany).toHaveBeenCalledTimes(1);
  });
});

describe("GET /drawings/:id/preview", () => {
  let app: express.Express;
  let prisma: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    ({ app, prisma } = buildApp());
  });

  it("returns the stored preview with an ETag", async () => {
    prisma.drawing.findUnique.mockResolvedValue({
      userId: MOCK_USER_ID,
      preview: "<svg>ok</svg>",
      updatedAt: new Date("2026-05-02T00:00:00Z"),
    });

    const res = await request(app).get(`/drawings/${MOCK_DRAWING_ID}/preview`);

    expect(res.status).toBe(200);
    expect(res.body.preview).toBe("<svg>ok</svg>");
    expect(res.headers.etag).toBeDefined();
  });

  it("returns 304 when If-None-Match matches", async () => {
    prisma.drawing.findUnique.mockResolvedValue({
      userId: MOCK_USER_ID,
      preview: "<svg>ok</svg>",
      updatedAt: new Date("2026-05-02T00:00:00Z"),
    });

    const first = await request(app).get(`/drawings/${MOCK_DRAWING_ID}/preview`);
    const etag = first.headers.etag as string;

    const second = await request(app)
      .get(`/drawings/${MOCK_DRAWING_ID}/preview`)
      .set("If-None-Match", etag);

    expect(second.status).toBe(304);
  });

  it("404s for a drawing the caller cannot view", async () => {
    prisma.drawing.findUnique.mockResolvedValue({ userId: "someone-else" });

    const res = await request(app).get(`/drawings/${MOCK_DRAWING_ID}/preview`);

    expect(res.status).toBe(404);
  });
});
