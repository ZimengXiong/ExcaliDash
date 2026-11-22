import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import express from "express";
import request from "supertest";
import { z } from "zod";
import type { Server } from "socket.io";
import type { PrismaClient } from "../generated/client";
import { registerDrawingCreateUpdateRoutes } from "../routes/dashboard/drawingCreateUpdateRoutes";
import { registerDrawingReadRoutes } from "../routes/dashboard/drawingReadRoutes";
import type { DrawingRouteContext } from "../routes/dashboard/drawingRouteContext";
import { cleanupTestDb, getTestPrisma, setupTestDb } from "./testUtils";

describe("scene save/load response efficiency", () => {
  let prisma: PrismaClient;
  let ownerId: string;
  let app: express.Express;
  const emit = vi.fn();
  const except = vi.fn(() => ({ emit }));
  const to = vi.fn(() => ({ emit, except }));
  const rooms = new Map<string, Set<string>>();
  const sockets = new Map<
    string,
    { id: string; data: { principal: { kind: "user"; userId: string } } }
  >();

  beforeAll(async () => {
    setupTestDb();
    prisma = getTestPrisma();
    const owner = await prisma.user.create({
      data: {
        email: "scene-efficiency@test.local",
        passwordHash: "unused",
        name: "Owner",
      },
    });
    ownerId = owner.id;
    const auth: express.RequestHandler = (req, _res, next) => {
      req.user = { id: ownerId } as express.Request["user"];
      next();
    };
    app = express();
    app.use(express.json());
    const context = {
      prisma,
      requireAuth: auth,
      optionalAuth: auth,
      asyncHandler: (handler) => (req, res, next) => {
        void handler(req, res, next).catch(next);
      },
      parseJsonField: (raw, fallback) => (raw ? JSON.parse(raw) : fallback),
      drawingUpdateSchema: z.object({
        elements: z.array(z.any()).optional(),
        files: z.record(z.string(), z.any()).optional(),
        preview: z.string().optional(),
        version: z.number().optional(),
      }),
      getRequestPrincipal: async () => ({ kind: "user", userId: ownerId }),
      respondWithAuthErrorIfPresent: () => false,
      invalidateDrawingsCache: vi.fn(),
      config: { nodeEnv: "test" },
      internDrawingFiles: async (files) => files,
      io: { to, sockets: { adapter: { rooms }, sockets } } as unknown as Server,
    } as DrawingRouteContext;
    registerDrawingReadRoutes(app, context);
    registerDrawingCreateUpdateRoutes(app, context);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    rooms.clear();
    sockets.clear();
    sockets.set("saver", {
      id: "saver",
      data: { principal: { kind: "user", userId: ownerId } },
    });
    await cleanupTestDb(prisma);
  });
  afterAll(async () => prisma.$disconnect());

  const createDrawing = (preview: string | null = "<svg>big</svg>") =>
    prisma.drawing.create({
      data: {
        userId: ownerId,
        name: "Efficiency",
        elements: JSON.stringify([{ id: "a", version: 1 }]),
        appState: JSON.stringify({ viewBackgroundColor: "#fff" }),
        files: JSON.stringify({ img: { dataURL: "/api/files/x/img" } }),
        preview,
        version: 1,
      },
    });

  it("returns the full scene by default, spliced from stored JSON", async () => {
    const drawing = await createDrawing();
    const res = await request(app).get(`/drawings/${drawing.id}`).expect(200);
    expect(res.body.elements).toEqual([{ id: "a", version: 1 }]);
    expect(res.body.appState).toEqual({ viewBackgroundColor: "#fff" });
    expect(res.body.files.img.dataURL).toBe("/api/files/x/img");
    expect(res.body.preview).toBe("<svg>big</svg>");
    expect(res.body.accessLevel).toBe("owner");
  });

  it("omits the preview for the editor but reports whether one exists", async () => {
    const withPreview = await createDrawing();
    const res = await request(app)
      .get(`/drawings/${withPreview.id}?omitPreview=1`)
      .expect(200);
    expect(res.body).not.toHaveProperty("preview");
    expect(res.body.hasPreview).toBe(true);
    expect(res.body.elements).toHaveLength(1);

    const withoutPreview = await createDrawing(null);
    const res2 = await request(app)
      .get(`/drawings/${withoutPreview.id}?omitPreview=1`)
      .expect(200);
    expect(res2.body.hasPreview).toBe(false);
  });

  it("revalidates editor loads with a version ETag", async () => {
    const drawing = await createDrawing();
    const first = await request(app).get(`/drawings/${drawing.id}`).expect(200);
    const etag = first.headers.etag;
    expect(etag).toMatch(/^W\/"drawing-/);
    await request(app)
      .get(`/drawings/${drawing.id}`)
      .set("If-None-Match", etag)
      .expect(304);
    await request(app)
      .put(`/drawings/${drawing.id}`)
      .send({ elements: [{ id: "b" }], version: 1 })
      .expect(200);
    await request(app)
      .get(`/drawings/${drawing.id}`)
      .set("If-None-Match", etag)
      .expect(200);
  });

  it("falls back for stored fields that are not complete JSON", async () => {
    const drawing = await createDrawing();
    await prisma.drawing.update({
      where: { id: drawing.id },
      data: { elements: "[broken]", appState: "{broken}", files: "null" },
    });
    const res = await request(app).get(`/drawings/${drawing.id}`).expect(200);
    expect(res.body.elements).toEqual([]);
    expect(res.body.appState).toEqual({});
    expect(res.body.files).toEqual({});
  });

  it("returns only metadata for Prefer: return=minimal saves", async () => {
    const drawing = await createDrawing();
    const res = await request(app)
      .put(`/drawings/${drawing.id}`)
      .set("Prefer", "return=minimal")
      .send({ elements: [{ id: "a", version: 2 }], version: 1 })
      .expect(200);
    expect(res.body.version).toBe(2);
    expect(res.body.id).toBe(drawing.id);
    expect(res.body).not.toHaveProperty("elements");
    expect(res.body).not.toHaveProperty("files");
    expect(res.body).not.toHaveProperty("preview");
    const stored = await prisma.drawing.findUniqueOrThrow({
      where: { id: drawing.id },
    });
    expect(JSON.parse(stored.elements)).toEqual([{ id: "a", version: 2 }]);
  });

  it("skips the persisted broadcast when no peer is in the room", async () => {
    const drawing = await createDrawing();
    rooms.set(`drawing_${drawing.id}`, new Set(["saver"]));
    await request(app)
      .put(`/drawings/${drawing.id}`)
      .set("X-Socket-Id", "saver")
      .send({ elements: [{ id: "a", version: 2 }], version: 1 })
      .expect(200);
    expect(emit).not.toHaveBeenCalled();

    const other = await createDrawing();
    await request(app)
      .put(`/drawings/${other.id}`)
      .send({ elements: [{ id: "a", version: 2 }], version: 1 })
      .expect(200);
    expect(emit).not.toHaveBeenCalled();
  });

  it("broadcasts the committed scene to peers but not back to the saver", async () => {
    const drawing = await createDrawing();
    rooms.set(`drawing_${drawing.id}`, new Set(["saver", "peer"]));
    await request(app)
      .put(`/drawings/${drawing.id}`)
      .set("Prefer", "return=minimal")
      .set("X-Socket-Id", "saver")
      .send({
        elements: [{ id: "a", version: 2 }],
        version: 1,
      })
      .expect(200);
    expect(except).toHaveBeenCalledWith("saver");
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("element-update", {
      drawingId: drawing.id,
      persisted: true,
      version: 2,
      elements: [{ id: "a", version: 2 }],
      appState: { viewBackgroundColor: "#fff" },
      files: {
        img: { dataURL: "/api/files/x/img" },
      },
      elementOrder: ["a"],
    });
  });

  it("ignores a socket id that belongs to another user in the drawing room", async () => {
    const drawing = await createDrawing();
    rooms.set(`drawing_${drawing.id}`, new Set(["peer"]));
    sockets.set("peer", {
      id: "peer",
      data: { principal: { kind: "user", userId: "other-user" } },
    });
    await request(app)
      .put(`/drawings/${drawing.id}`)
      .set("X-Socket-Id", "peer")
      .send({ elements: [{ id: "a", version: 2 }], version: 1 })
      .expect(200);
    expect(except).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
