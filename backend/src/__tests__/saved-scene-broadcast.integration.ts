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
import type { DrawingRouteContext } from "../routes/dashboard/drawingRouteContext";
import { cleanupTestDb, getTestPrisma, setupTestDb } from "./testUtils";

describe("persisted collaboration scene broadcasts", () => {
  let prisma: PrismaClient;
  let ownerId: string;
  let app: express.Express;
  const emit = vi.fn();
  const to = vi.fn(() => ({ emit }));
  const revalidateDrawingAccess = vi.fn();

  beforeAll(async () => {
    setupTestDb();
    prisma = getTestPrisma();
    const owner = await prisma.user.create({
      data: {
        email: "saved-scene@test.local",
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
    registerDrawingCreateUpdateRoutes(app, {
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
        collectionId: z.string().nullable().optional(),
      }),
      getRequestPrincipal: async () => ({ kind: "user", userId: ownerId }),
      respondWithAuthErrorIfPresent: () => false,
      invalidateDrawingsCache: vi.fn(),
      config: { nodeEnv: "test" },
      internDrawingFiles: async (files) => files,
      ensureTrashCollection: async (db, userId) => {
        await db.collection.upsert({
          where: { id: `trash:${userId}` },
          update: {},
          create: { id: `trash:${userId}`, name: "Trash", userId },
        });
      },
      revalidateDrawingAccess,
      io: { to } as unknown as Server,
    } as DrawingRouteContext);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanupTestDb(prisma);
  });
  afterAll(async () => prisma.$disconnect());

  const createDrawing = () =>
    prisma.drawing.create({
      data: {
        userId: ownerId,
        name: "Saved scene",
        elements: JSON.stringify([{ id: "earlier", version: 1 }]),
        appState: "{}",
        files: JSON.stringify({
          earlierImage: { dataURL: "https://example.test/earlier.png" },
        }),
        version: 3,
      },
    });

  it("delivers the committed scene and merged files to peers that missed the realtime delta", async () => {
    const drawing = await createDrawing();
    const elements = [
      { id: "earlier", version: 1 },
      { id: "new", version: 1 },
    ];
    const response = await request(app)
      .put(`/drawings/${drawing.id}`)
      .send({
        elements,
        files: { newImage: { dataURL: "https://example.test/new.png" } },
        version: 3,
      });
    expect(response.status).toBe(200);
    expect(to).toHaveBeenCalledWith(`drawing_${drawing.id}`);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith("element-update", {
      drawingId: drawing.id,
      persisted: true,
      elements: response.body.elements,
      files: response.body.files,
      elementOrder: ["earlier", "new"],
    });
    expect(response.body.files).toHaveProperty("earlierImage");
    expect(response.body.files).toHaveProperty("newImage");
  });

  it("does not broadcast a scene rejected by its version guard", async () => {
    const drawing = await createDrawing();
    await request(app)
      .put(`/drawings/${drawing.id}`)
      .send({ elements: [{ id: "stale" }], version: 2 })
      .expect(409);
    expect(to).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("does not broadcast preview-only updates as scene edits", async () => {
    const drawing = await createDrawing();
    await request(app)
      .put(`/drawings/${drawing.id}`)
      .send({ preview: "<svg></svg>" })
      .expect(200);
    expect(to).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("re-checks live collaborators when the drawing moves to Trash", async () => {
    const drawing = await createDrawing();
    await request(app)
      .put(`/drawings/${drawing.id}`)
      .send({ collectionId: "trash" })
      .expect(200);
    expect(revalidateDrawingAccess).toHaveBeenCalledWith(drawing.id);
  });

  it("does not re-check live collaborators when the collection stays the same", async () => {
    const drawing = await createDrawing();
    await request(app)
      .put(`/drawings/${drawing.id}`)
      .send({ preview: "<svg></svg>" })
      .expect(200);
    expect(revalidateDrawingAccess).not.toHaveBeenCalled();
  });
});
