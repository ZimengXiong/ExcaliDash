import { describe, expect, it, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { z } from "zod";
import { registerDrawingRoutes } from "../routes/dashboard/drawings";

/**
 * Tests for drawings-payload-perf change:
 * 1. Summary list excludes `preview` by default (verify Prisma select projection)
 * 2. Preview endpoint serves SVG with proper auth and caching
 * 3. includeData=true guardrail requires explicit small pagination
 */

const MOCK_USER_ID = "user-1";
const MOCK_OWNER_ID = "owner-1";
const MOCK_DRAWING_ID = "drawing-1";
const MOCK_PRIVATE_DRAWING_ID = "drawing-private";
const MOCK_PUBLIC_LINK_DRAWING_ID = "drawing-public-link";
const MOCK_NO_PREVIEW_DRAWING_ID = "drawing-no-preview";
const MOCK_MISSING_DRAWING_ID = "drawing-missing";

const MOCK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="blue"/></svg>';

function makeDrawing(overrides: Record<string, unknown> = {}) {
  return {
    id: MOCK_DRAWING_ID,
    name: "Test Drawing",
    elements: JSON.stringify([{ id: "el-1", type: "rectangle" }]),
    appState: JSON.stringify({ viewBackgroundColor: "#ffffff" }),
    files: "{}",
    version: 1,
    userId: MOCK_USER_ID,
    collectionId: null,
    preview: MOCK_SVG,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

// A drawing without preview — matches what Prisma would return when select excludes it
function makeSummaryDrawing(overrides: Record<string, unknown> = {}) {
  const full = makeDrawing(overrides);
  const { preview: _p, elements: _e, appState: _as, files: _f, ...summary } = full;
  return summary;
}

function buildAppDeps(prisma: any) {
  return {
    prisma,
    requireAuth: (_req: any, _res: any, next: any) => next(),
    optionalAuth: (_req: any, _res: any, next: any) => next(),
    asyncHandler: (fn: any) => (req: any, res: any, next: any) =>
      Promise.resolve(fn(req, res, next)).catch(next),
    parseJsonField: (val: string, fallback: any) => {
      try { return JSON.parse(val); } catch { return fallback; }
    },
    validateImportedDrawing: vi.fn().mockReturnValue(true),
    drawingCreateSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) } as unknown as z.ZodTypeAny,
    drawingUpdateSchema: { safeParse: vi.fn() } as unknown as z.ZodTypeAny,
    respondWithValidationErrors: vi.fn(),
    ensureTrashCollection: vi.fn(),
    invalidateDrawingsCache: vi.fn(),
    buildDrawingsCacheKey: vi.fn(),
    getCachedDrawingsBody: vi.fn().mockReturnValue(null),
    cacheDrawingsResponse: vi.fn().mockImplementation((_key: string, payload: unknown) =>
      Buffer.from(JSON.stringify(payload), "utf8")
    ),
    MAX_PAGE_SIZE: 100,
    config: { nodeEnv: "test", enableAuditLogging: false },
    logAuditEvent: vi.fn(),
    sanitizeText: (input: unknown, _maxLength?: number) => String(input ?? ""),
    collectionNameSchema: { safeParse: vi.fn().mockReturnValue({ success: true, data: {} }) } as unknown as z.ZodTypeAny,
  };
}

function buildApp(overrides: { user?: any } = {}) {
  const prisma = {
    drawing: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    drawingPermission: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    drawingLinkShare: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
    },
    collection: { findFirst: vi.fn() },
  } as any;

  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.user = overrides.user ?? { id: MOCK_USER_ID, role: "USER" };
    next();
  });

  registerDrawingRoutes(app, buildAppDeps(prisma));

  return { app, prisma };
}

describe("Drawings Payload Performance", () => {
  let app: express.Express;
  let prisma: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    ({ app, prisma } = buildApp());
  });

  // === TASK 1.1: Summary excludes preview ===

  describe("GET /drawings — lightweight summary without preview", () => {
    it("returns DrawingSummary objects without preview field by default", async () => {
      // Return summary data matching what Prisma's select (without preview) would produce
      prisma.drawing.findMany.mockResolvedValue([makeSummaryDrawing()]);
      prisma.drawing.count.mockResolvedValue(1);

      const res = await request(app).get("/drawings");

      expect(res.status).toBe(200);
      expect(res.body.drawings).toHaveLength(1);
      expect(res.body.drawings[0]).toHaveProperty("id");
      expect(res.body.drawings[0]).toHaveProperty("name");
      expect(res.body.drawings[0]).toHaveProperty("collectionId");
      expect(res.body.drawings[0]).toHaveProperty("version");
      expect(res.body.drawings[0]).toHaveProperty("createdAt");
      expect(res.body.drawings[0]).toHaveProperty("updatedAt");
      // preview MUST NOT be present
      expect(res.body.drawings[0]).not.toHaveProperty("preview");
      // Verify the select parameter passed to Prisma excludes preview
      expect(prisma.drawing.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.not.objectContaining({ preview: expect.anything() }),
        })
      );
    });

    it("returns multiple drawings, none with preview", async () => {
      prisma.drawing.findMany.mockResolvedValue([
        makeSummaryDrawing({ id: "d1" }),
        makeSummaryDrawing({ id: "d2" }),
      ]);
      prisma.drawing.count.mockResolvedValue(2);

      const res = await request(app).get("/drawings");

      expect(res.status).toBe(200);
      expect(res.body.drawings).toHaveLength(2);
      for (const d of res.body.drawings) {
        expect(d).not.toHaveProperty("preview");
      }
    });
  });

  describe("GET /drawings/shared — lightweight summary without preview", () => {
    it("returns shared drawings without preview field", async () => {
      prisma.drawing.findMany.mockResolvedValue([
        {
          id: "shared-1",
          name: "Shared Drawing",
          collectionId: null,
          version: 3,
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-02-01T00:00:00Z"),
          userId: "other-user",
          permissions: [{ permission: "view" }],
        },
      ]);
      prisma.drawing.count.mockResolvedValue(1);

      const res = await request(app).get("/drawings/shared");

      expect(res.status).toBe(200);
      expect(res.body.drawings).toHaveLength(1);
      expect(res.body.drawings[0]).toHaveProperty("id");
      expect(res.body.drawings[0]).not.toHaveProperty("preview");
    });
  });

  describe("GET /drawings with includeData=true — full payload unaffected", () => {
    it("includes preview, elements, appState, files when limit is small enough", async () => {
      prisma.drawing.findMany.mockResolvedValue([
        {
          ...makeDrawing(),
          elements: JSON.stringify([{ id: "el-1", type: "rectangle" }]),
          appState: JSON.stringify({ viewBackgroundColor: "#fff" }),
          files: JSON.stringify({}),
        },
      ]);
      prisma.drawing.count.mockResolvedValue(1);

      const res = await request(app).get("/drawings?includeData=true&limit=10");

      expect(res.status).toBe(200);
      expect(res.body.drawings[0]).toHaveProperty("elements");
      expect(res.body.drawings[0]).toHaveProperty("appState");
      expect(res.body.drawings[0]).toHaveProperty("files");
      // Full payload includes preview — prove it remains available when full data is explicitly requested
      expect(res.body.drawings[0]).toHaveProperty("preview");
      expect(res.body.drawings[0].preview).toBe(MOCK_SVG);
    });
  });

  // === TASK 1.2: Preview endpoint ===

  describe("GET /drawings/:id/preview — SVG preview endpoint", () => {
    it("returns 200 with SVG for owner accessing own drawing", async () => {
      prisma.drawing.findUnique.mockResolvedValue(makeDrawing({ userId: MOCK_USER_ID }));
      prisma.drawingLinkShare.findFirst.mockResolvedValue(null);

      const res = await request(app).get(`/drawings/${MOCK_DRAWING_ID}/preview`);

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/image\/svg\+xml/);
      expect(res.body.toString()).toBe(MOCK_SVG);
    });

    it("returns Cache-Control and ETag headers", async () => {
      prisma.drawing.findUnique.mockResolvedValue(makeDrawing({ userId: MOCK_USER_ID }));
      prisma.drawingLinkShare.findFirst.mockResolvedValue(null);

      const res = await request(app).get(`/drawings/${MOCK_DRAWING_ID}/preview`);

      expect(res.headers["cache-control"]).toBeDefined();
      expect(res.headers["etag"]).toBeDefined();
    });

    it("returns 304 for matching ETag (If-None-Match)", async () => {
      prisma.drawing.findUnique.mockResolvedValue(makeDrawing({ userId: MOCK_USER_ID }));
      prisma.drawingLinkShare.findFirst.mockResolvedValue(null);

      // First request to get the ETag
      const res1 = await request(app).get(`/drawings/${MOCK_DRAWING_ID}/preview`);
      const etag = res1.headers["etag"];

      // Second request with If-None-Match
      const res2 = await request(app)
        .get(`/drawings/${MOCK_DRAWING_ID}/preview`)
        .set("If-None-Match", etag);

      expect(res2.status).toBe(304);
    });

    it("returns 200 for public/link-share drawing without authentication", async () => {
      // Build app WITHOUT req.user (simulating unauthenticated request)
      const unauthPrisma = {
        drawing: {
          findUnique: vi.fn(),
          findFirst: vi.fn(),
          findMany: vi.fn(),
          count: vi.fn(),
        },
        drawingPermission: {
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue(null),
        },
        drawingLinkShare: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn(),
        },
        collection: { findFirst: vi.fn() },
      } as any;

      // Drawing exists, active link share
      unauthPrisma.drawing.findUnique.mockResolvedValue(
        makeDrawing({ userId: MOCK_OWNER_ID, id: MOCK_PUBLIC_LINK_DRAWING_ID })
      );
      unauthPrisma.drawingLinkShare.findFirst.mockResolvedValue({ permission: "view" });

      // No user middleware — unauthenticated
      const rawApp = express();
      rawApp.use(express.json());
      registerDrawingRoutes(rawApp, buildAppDeps(unauthPrisma));

      const res = await request(rawApp).get(`/drawings/${MOCK_PUBLIC_LINK_DRAWING_ID}/preview`);

      expect(res.status).toBe(200);
      expect(res.body.toString()).toBe(MOCK_SVG);
    });

    it("returns 401 for private drawing when unauthenticated", async () => {
      const unauthPrisma = {
        drawing: {
          findUnique: vi.fn(),
          findFirst: vi.fn(),
          findMany: vi.fn(),
          count: vi.fn(),
        },
        drawingPermission: {
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue(null),
        },
        drawingLinkShare: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null), // No active link share
        },
        collection: { findFirst: vi.fn() },
      } as any;

      unauthPrisma.drawing.findUnique.mockResolvedValue(
        makeDrawing({ id: MOCK_PRIVATE_DRAWING_ID, userId: MOCK_OWNER_ID })
      );

      const rawApp = express();
      rawApp.use(express.json());
      registerDrawingRoutes(rawApp, buildAppDeps(unauthPrisma));

      const res = await request(rawApp).get(`/drawings/${MOCK_PRIVATE_DRAWING_ID}/preview`);

      expect(res.status).toBe(401);
    });

    it("returns 404 for private drawing when authenticated but not authorized", async () => {
      const { app: noAccessApp, prisma: noAccessPrisma } = buildApp();
      // User is authenticated but does not own the drawing and has no permission/link
      noAccessPrisma.drawing.findUnique.mockResolvedValue(
        makeDrawing({ id: MOCK_PRIVATE_DRAWING_ID, userId: MOCK_OWNER_ID })
      );
      noAccessPrisma.drawingLinkShare.findFirst.mockResolvedValue(null);
      // User has no permission — findUnique returns null
      noAccessPrisma.drawingPermission.findUnique.mockResolvedValue(null);

      const res = await request(noAccessApp).get(`/drawings/${MOCK_PRIVATE_DRAWING_ID}/preview`);

      expect(res.status).toBe(404);
    });

    it("returns 404 for drawing without preview", async () => {
      prisma.drawing.findUnique.mockResolvedValue(
        makeDrawing({ id: MOCK_NO_PREVIEW_DRAWING_ID, userId: MOCK_USER_ID, preview: null })
      );
      prisma.drawingLinkShare.findFirst.mockResolvedValue(null);

      const res = await request(app).get(`/drawings/${MOCK_NO_PREVIEW_DRAWING_ID}/preview`);

      expect(res.status).toBe(404);
    });

    it("returns 404 for non-existent drawing", async () => {
      prisma.drawing.findUnique.mockResolvedValue(null);
      prisma.drawingLinkShare.findFirst.mockResolvedValue(null);

      const res = await request(app).get(`/drawings/${MOCK_MISSING_DRAWING_ID}/preview`);

      expect(res.status).toBe(404);
    });

    it("returns 200 for collaborator (view permission) fetching preview", async () => {
      const collaboratorId = "user-collab";
      const ownerId = "owner-1";

      const collabPrisma = {
        drawing: {
          findUnique: vi.fn(),
          findFirst: vi.fn(),
          findMany: vi.fn(),
          count: vi.fn(),
        },
        drawingPermission: {
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn(),
        },
        drawingLinkShare: {
          findMany: vi.fn().mockResolvedValue([]),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        collection: { findFirst: vi.fn() },
      } as any;

      collabPrisma.drawing.findUnique.mockResolvedValue(
        makeDrawing({ id: MOCK_DRAWING_ID, userId: ownerId })
      );
      collabPrisma.drawingPermission.findUnique.mockResolvedValue({ permission: "view" });

      const collabApp = express();
      collabApp.use(express.json());
      collabApp.use((req: any, _res: any, next: any) => {
        req.user = { id: collaboratorId, role: "USER" };
        next();
      });
      registerDrawingRoutes(collabApp, buildAppDeps(collabPrisma));

      const res = await request(collabApp).get(`/drawings/${MOCK_DRAWING_ID}/preview`);

      expect(res.status).toBe(200);
      expect(res.body.toString()).toBe(MOCK_SVG);
    });
  });

  // === TASK 1.3: includeData guardrail ===

  describe("GET /drawings includeData=true guardrail", () => {
    it("returns 200 with full data when limit <= 20", async () => {
      prisma.drawing.findMany.mockResolvedValue([
        {
          ...makeDrawing(),
          elements: JSON.stringify([{ id: "el-1", type: "rectangle" }]),
          appState: JSON.stringify({ viewBackgroundColor: "#fff" }),
          files: JSON.stringify({}),
        },
      ]);
      prisma.drawing.count.mockResolvedValue(1);

      const res = await request(app).get("/drawings?includeData=true&limit=10");

      expect(res.status).toBe(200);
      expect(res.body.drawings).toHaveLength(1);
      expect(Array.isArray(res.body.drawings[0].elements)).toBe(true);
    });

    it("returns 400 when includeData=true without limit", async () => {
      const res = await request(app).get("/drawings?includeData=true");

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.message).toMatch(/limit/i);
    });

    it("returns 400 when includeData=true with limit > 20", async () => {
      const res = await request(app).get("/drawings?includeData=true&limit=200");

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.message).toMatch(/limit/i);
    });

    it("returns 200 when includeData=true with limit=20 (boundary)", async () => {
      prisma.drawing.findMany.mockResolvedValue([]);
      prisma.drawing.count.mockResolvedValue(0);

      const res = await request(app).get("/drawings?includeData=true&limit=20");

      expect(res.status).toBe(200);
    });
  });
});
