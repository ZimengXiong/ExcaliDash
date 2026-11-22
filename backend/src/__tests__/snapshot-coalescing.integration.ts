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
import type { PrismaClient } from "../generated/client";
import { registerDrawingCreateUpdateRoutes } from "../routes/dashboard/drawingCreateUpdateRoutes";
import type { DrawingRouteContext } from "../routes/dashboard/drawingRouteContext";
import { cleanupTestDb, getTestPrisma, setupTestDb } from "./testUtils";

const elements = (live: number, deleted = 0) => [
  ...Array.from({ length: live }, (_, i) => ({ id: `e${i}`, version: 1 })),
  ...Array.from({ length: deleted }, (_, i) => ({
    id: `d${i}`,
    version: 2,
    isDeleted: true,
  })),
];

describe("autosave snapshot coalescing", () => {
  let prisma: PrismaClient;
  let ownerId: string;
  const config = { nodeEnv: "test", snapshotMinIntervalMs: 30_000 };
  let app: express.Express;

  beforeAll(async () => {
    setupTestDb();
    prisma = getTestPrisma();
    ownerId = (
      await prisma.user.create({
        data: {
          email: "coalesce@test.local",
          passwordHash: "unused",
          name: "Owner",
        },
      })
    ).id;
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
        appState: z.record(z.string(), z.any()).optional(),
        version: z.number().optional(),
      }),
      getRequestPrincipal: async () => ({ kind: "user", userId: ownerId }),
      respondWithAuthErrorIfPresent: () => false,
      invalidateDrawingsCache: vi.fn(),
      config,
      internDrawingFiles: async (files) => files,
    } as unknown as DrawingRouteContext);
  });

  beforeEach(async () => {
    config.snapshotMinIntervalMs = 30_000;
    await cleanupTestDb(prisma);
  });
  afterAll(async () => prisma.$disconnect());

  const createDrawing = (live = 10) =>
    prisma.drawing.create({
      data: {
        userId: ownerId,
        name: "Coalesce",
        elements: JSON.stringify(elements(live)),
        appState: "{}",
        version: 1,
      },
    });
  const save = (id: string, version: number, body: object) =>
    request(app)
      .put(`/drawings/${id}`)
      .send({ ...body, version })
      .expect(200);
  const snapshotVersions = async (drawingId: string) =>
    (
      await prisma.drawingSnapshot.findMany({
        where: { drawingId },
        orderBy: { version: "asc" },
        select: { version: true },
      })
    ).map((row) => row.version);

  it("keeps one snapshot per interval for ordinary autosaves", async () => {
    const drawing = await createDrawing();
    await save(drawing.id, 1, { elements: elements(11) });
    await save(drawing.id, 2, { elements: elements(12) });
    await save(drawing.id, 3, { appState: { viewBackgroundColor: "#000" } });
    expect(await snapshotVersions(drawing.id)).toEqual([1]);
  });

  it("snapshots again once the interval has passed", async () => {
    const drawing = await createDrawing();
    await save(drawing.id, 1, { elements: elements(11) });
    await prisma.drawingSnapshot.updateMany({
      where: { drawingId: drawing.id },
      data: { createdAt: new Date(Date.now() - 60_000) },
    });
    await save(drawing.id, 2, { elements: elements(12) });
    expect(await snapshotVersions(drawing.id)).toEqual([1, 2]);
  });

  it("always snapshots a save that drops many live elements", async () => {
    const drawing = await createDrawing();
    await save(drawing.id, 1, { elements: elements(10) });
    // Deleting 1 of 10 is ordinary editing.
    await save(drawing.id, 2, { elements: elements(9, 1) });
    // Tombstoning most of the scene keeps the state before it restorable.
    await save(drawing.id, 3, { elements: elements(2, 8) });
    // Clearing what is left is a wipe too.
    await save(drawing.id, 4, { elements: [] });
    expect(await snapshotVersions(drawing.id)).toEqual([1, 3, 4]);
  });

  it("parses stored scenes it has not seen when deciding", async () => {
    const drawing = await createDrawing(10);
    await prisma.drawingSnapshot.create({
      data: {
        drawingId: drawing.id,
        version: 0,
        elements: "[]",
        appState: "{}",
      },
    });
    await save(drawing.id, 1, { elements: elements(1) });
    expect(await snapshotVersions(drawing.id)).toEqual([0, 1]);
  });

  it("snapshots every save when the interval is 0", async () => {
    config.snapshotMinIntervalMs = 0;
    const drawing = await createDrawing();
    await save(drawing.id, 1, { elements: elements(11) });
    await save(drawing.id, 2, { elements: elements(12) });
    expect(await snapshotVersions(drawing.id)).toEqual([1, 2]);
  });
});
