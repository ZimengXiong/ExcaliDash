import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import type { PrismaClient } from "../generated/client";
import { getTestPrisma, setupTestDb, initTestDb, cleanupTestDb } from "./testUtils";
import { registerDrawingAgentRoutes } from "../routes/dashboard/drawingAgentRoutes";
import { applySceneUpdateTx } from "../routes/dashboard/sceneUpdate";
import type { DrawingRouteContext } from "../routes/dashboard/drawingRouteContext";

const parseJsonField = <T>(raw: string | null | undefined, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

type Emitted = { room: string; event: string; payload: any };

const buildApp = (
  prisma: PrismaClient,
  userId: string,
  emitted: Emitted[],
) => {
  const app = express();
  app.use(express.json({ limit: "10mb" }));

  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: any) => emitted.push({ room, event, payload }),
    }),
  };

  const context = {
    prisma,
    requireAuth: (req: any, _res: any, next: any) => {
      req.user = { id: userId, email: "u@t", name: "U", role: "USER" };
      req.principal = { kind: "user", userId };
      next();
    },
    asyncHandler:
      (fn: any) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
    parseJsonField,
    invalidateDrawingsCache: () => {},
    logAuditEvent: async () => {},
    io,
    agentOps: { rateLimitMaxRequests: 1000, rateLimitWindowMs: 60000 },
  } as unknown as DrawingRouteContext;

  registerDrawingAgentRoutes(app, context);
  return app;
};

const createDrawing = async (
  prisma: PrismaClient,
  userId: string,
  elements: any[] = [],
) => {
  return prisma.drawing.create({
    data: {
      name: "Agent Test",
      elements: JSON.stringify(elements),
      appState: JSON.stringify({ viewBackgroundColor: "#ffffff" }),
      files: JSON.stringify({}),
      userId,
    },
  });
};

describe("Agent ops engine", () => {
  let prisma: PrismaClient;
  let userId: string;
  let emitted: Emitted[];
  let app: express.Express;

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
    const user = await initTestDb(prisma);
    userId = user.id;
    emitted = [];
    app = buildApp(prisma, userId, emitted);
  });

  it("applies add_shape, bumps version, persists, and returns createdIds", async () => {
    const drawing = await createDrawing(prisma, userId);
    const res = await request(app)
      .post(`/drawings/${drawing.id}/ops`)
      .send({ ops: [{ op: "add_shape", shape: "rectangle", x: 10, y: 20, label: "Hi" }] });

    expect(res.status).toBe(200);
    expect(res.body.version).toBe(drawing.version + 1);
    expect(res.body.revertVersion).toBe(drawing.version);
    expect(res.body.results[0].createdIds).toHaveLength(2); // shape + bound label
    expect(res.body.summary).toContain("rectangle");

    const stored = await prisma.drawing.findUnique({ where: { id: drawing.id } });
    const elements = JSON.parse(stored!.elements);
    expect(elements).toHaveLength(2);
    const rect = elements.find((e: any) => e.type === "rectangle");
    expect(rect.x).toBe(10);
    expect(Array.isArray(rect.boundElements)).toBe(true);
  });

  it("is atomic: a batch with a bad element ref persists nothing (422)", async () => {
    const drawing = await createDrawing(prisma, userId);
    const res = await request(app)
      .post(`/drawings/${drawing.id}/ops`)
      .send({
        ops: [
          { op: "add_shape", shape: "ellipse", x: 0, y: 0 },
          { op: "set_style", id: "does-not-exist", style: { strokeColor: "#f00" } },
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body.errors[0]).toMatchObject({
      opIndex: 1,
      code: "ELEMENT_NOT_FOUND",
      elementId: "does-not-exist",
    });

    // Nothing written: version unchanged, no snapshot, no elements.
    const stored = await prisma.drawing.findUnique({ where: { id: drawing.id } });
    expect(stored!.version).toBe(drawing.version);
    expect(JSON.parse(stored!.elements)).toHaveLength(0);
    const snaps = await prisma.drawingSnapshot.count({ where: { drawingId: drawing.id } });
    expect(snaps).toBe(0);
  });

  it("rejects unknown style keys with INVALID_STYLE_KEY", async () => {
    const seed = [
      { id: "rect-1", type: "rectangle", x: 0, y: 0, width: 10, height: 10, isDeleted: false },
    ];
    const drawing = await createDrawing(prisma, userId, seed);
    const res = await request(app)
      .post(`/drawings/${drawing.id}/ops`)
      .send({ ops: [{ op: "set_style", id: "rect-1", style: { evil: "x" } }] });

    expect(res.status).toBe(422);
    expect(res.body.errors[0].code).toBe("INVALID_STYLE_KEY");
  });

  it("sanitizes set_text (control chars stripped) through the applier", async () => {
    const seed = [
      { id: "t-1", type: "text", x: 0, y: 0, width: 10, height: 10, text: "", isDeleted: false },
    ];
    const drawing = await createDrawing(prisma, userId, seed);
    const res = await request(app)
      .post(`/drawings/${drawing.id}/ops`)
      .send({ ops: [{ op: "set_text", id: "t-1", text: "clean\x00\x07text" }] });

    expect(res.status).toBe(200);
    const stored = await prisma.drawing.findUnique({ where: { id: drawing.id } });
    const el = JSON.parse(stored!.elements).find((e: any) => e.id === "t-1");
    expect(el.text).toBe("cleantext");
  });

  it("broadcasts element-update with origin agent-ops and the changed elements", async () => {
    const seed = [
      { id: "a", type: "rectangle", x: 0, y: 0, width: 20, height: 20, isDeleted: false },
      { id: "b", type: "rectangle", x: 100, y: 0, width: 20, height: 20, isDeleted: false },
    ];
    const drawing = await createDrawing(prisma, userId, seed);
    const res = await request(app)
      .post(`/drawings/${drawing.id}/ops`)
      .send({ ops: [{ op: "connect", fromId: "a", toId: "b" }] });

    expect(res.status).toBe(200);
    expect(emitted).toHaveLength(1);
    const { room, event, payload } = emitted[0];
    expect(room).toBe(`drawing_${drawing.id}`);
    expect(event).toBe("element-update");
    expect(payload.origin).toBe("agent-ops");
    expect(payload.drawingId).toBe(drawing.id);
    expect(typeof payload.opsBatchId).toBe("string");
    // The new arrow plus both re-bound endpoints are in the changed set.
    const ids = payload.elements.map((e: any) => e.id);
    expect(ids).toContain("a");
    expect(ids).toContain("b");
    const arrow = payload.elements.find((e: any) => e.type === "arrow");
    expect(arrow.startBinding.elementId).toBe("a");
    expect(arrow.endBinding.elementId).toBe("b");
    // Order changed (element added) => full order broadcast.
    expect(Array.isArray(payload.elementOrder)).toBe(true);
  });

  it("delete soft-deletes and broadcasts a tombstone", async () => {
    const seed = [
      { id: "d1", type: "rectangle", x: 0, y: 0, width: 20, height: 20, isDeleted: false },
    ];
    const drawing = await createDrawing(prisma, userId, seed);
    const res = await request(app)
      .post(`/drawings/${drawing.id}/ops`)
      .send({ ops: [{ op: "delete", id: "d1" }] });

    expect(res.status).toBe(200);
    const stored = await prisma.drawing.findUnique({ where: { id: drawing.id } });
    const el = JSON.parse(stored!.elements).find((e: any) => e.id === "d1");
    expect(el.isDeleted).toBe(true);
    const tomb = emitted[0].payload.elements.find((e: any) => e.id === "d1");
    expect(tomb.isDeleted).toBe(true);
  });

  it("GET /summary returns text/plain z-order lines for live elements", async () => {
    const seed = [
      { id: "s1", type: "rectangle", x: 5, y: 6, width: 10, height: 10, isDeleted: false },
      { id: "s2", type: "text", x: 0, y: 0, width: 10, height: 10, text: "hello", isDeleted: false },
      { id: "s3", type: "rectangle", x: 0, y: 0, width: 1, height: 1, isDeleted: true },
    ];
    const drawing = await createDrawing(prisma, userId, seed);
    const res = await request(app).get(`/drawings/${drawing.id}/summary`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.text).toContain("s1 rectangle");
    expect(res.text).toContain('"hello"');
    expect(res.text).not.toContain("s3"); // deleted excluded
  });

  it("GET /elements/:id returns the element and its bound children", async () => {
    const seed = [
      {
        id: "c1",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 40,
        height: 20,
        boundElements: [{ id: "lbl", type: "text" }],
        isDeleted: false,
      },
      { id: "lbl", type: "text", x: 5, y: 5, width: 10, height: 10, text: "cap", containerId: "c1", isDeleted: false },
    ];
    const drawing = await createDrawing(prisma, userId, seed);
    const res = await request(app).get(`/drawings/${drawing.id}/elements/c1`);
    expect(res.status).toBe(200);
    expect(res.body.element.id).toBe("c1");
    expect(res.body.children).toHaveLength(1);
    expect(res.body.children[0].id).toBe("lbl");
  });

  it("reverts to a snapshot version, undoing an applied batch", async () => {
    const seed = [
      { id: "keep", type: "rectangle", x: 0, y: 0, width: 10, height: 10, isDeleted: false },
    ];
    const drawing = await createDrawing(prisma, userId, seed);
    // Batch 1 adds a shape; its response carries the revert target.
    const add = await request(app)
      .post(`/drawings/${drawing.id}/ops`)
      .send({ ops: [{ op: "add_shape", shape: "diamond", x: 50, y: 50 }] });
    expect(add.status).toBe(200);
    const revertVersion = add.body.revertVersion;

    const revert = await request(app)
      .post(`/drawings/${drawing.id}/ops`)
      .send({ ops: [{ op: "revert_to_snapshot", version: revertVersion }] });
    expect(revert.status).toBe(200);

    const stored = await prisma.drawing.findUnique({ where: { id: drawing.id } });
    const live = JSON.parse(stored!.elements).filter((e: any) => !e.isDeleted);
    expect(live).toHaveLength(1);
    expect(live[0].id).toBe("keep");
  });
});

describe("applySceneUpdateTx version-conflict retry", () => {
  it("retries the transaction when the version-guarded write loses a race", async () => {
    let version = 1;
    let attempt = 0;
    // Fake prisma whose first updateMany loses (count 0) as if a concurrent
    // writer committed between the tx read and the guarded write.
    const fakePrisma: any = {
      $transaction: async (fn: any) => fn(fakePrisma),
      drawing: {
        findUnique: async () => ({
          id: "d",
          version,
          elements: "[]",
          appState: "{}",
          files: "{}",
          name: "d",
        }),
        updateMany: async () => {
          attempt++;
          if (attempt === 1) {
            version += 1; // simulate the concurrent commit
            return { count: 0 };
          }
          version += 1;
          return { count: 1 };
        },
        findFirst: async () => ({ id: "d", version, name: "d", elements: "[]", appState: "{}", files: "{}" }),
      },
      drawingSnapshot: { create: async () => ({}) },
    };

    const result = await applySceneUpdateTx({
      prisma: fakePrisma,
      drawingId: "d",
      parseJsonField,
      versionGuard: "optimistic",
      maxRetries: 3,
      mutate: () => ({ data: { elements: "[]" } }),
    });

    expect(attempt).toBe(2); // one conflict, one success
    expect(result.drawing.version).toBe(version);
  });
});
