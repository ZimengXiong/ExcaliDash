import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { PrismaClient } from "../generated/client";
import {
  getTestPrisma,
  setupTestDb,
  initTestDb,
  cleanupTestDb,
} from "../__tests__/testUtils";
import { encryptSecret } from "./crypto";

// Scripted provider completions, controlled per test. Hoisted so the vi.mock
// factory (also hoisted) can close over the same reference.
const scripted = vi.hoisted(() => ({ queue: [] as any[], calls: 0 }));

vi.mock("./providers/anthropic", () => ({
  anthropicAdapter: {
    complete: async () => {
      scripted.calls += 1;
      return scripted.queue.shift() ?? { text: "", toolCalls: [] };
    },
  },
}));

import { registerAiRoutes } from "./chatRoute";

const parseJsonField = <T>(raw: string | null | undefined, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

type Emitted = { room: string; event: string; payload: any };

const buildApp = (prisma: PrismaClient, userId: string, emitted: Emitted[], credentialType = "jwt") => {
  const app = express();
  app.use(express.json());
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: any) => emitted.push({ room, event, payload }),
    }),
  };
  registerAiRoutes(app, {
    prisma,
    requireAuth: (req: any, _res: any, next: any) => {
      req.user = { id: userId, email: "u@t", name: "U", role: "USER", authCredentialType: credentialType };
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
    defaultSystemConfigId: "default",
  });
  return app;
};

const createDrawing = async (prisma: PrismaClient, userId: string) =>
  prisma.drawing.create({
    data: {
      name: "AI Test",
      elements: JSON.stringify([]),
      appState: JSON.stringify({ viewBackgroundColor: "#ffffff" }),
      files: JSON.stringify({}),
      userId,
    },
  });

const enableAi = async (prisma: PrismaClient) => {
  await prisma.systemConfig.upsert({
    where: { id: "default" },
    update: { aiProvider: "anthropic", aiApiKeyEncrypted: encryptSecret("sk-test") },
    create: { id: "default", aiProvider: "anthropic", aiApiKeyEncrypted: encryptSecret("sk-test") },
  });
};

describe("ai/chatRoute", () => {
  let prisma: PrismaClient;
  let userId: string;

  beforeAll(async () => {
    setupTestDb();
    prisma = getTestPrisma();
    await initTestDb(prisma);
    const user = await prisma.user.create({
      data: { email: "owner@t", name: "Owner", passwordHash: "x" },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await cleanupTestDb(prisma);
  });

  beforeEach(async () => {
    scripted.queue = [];
    scripted.calls = 0;
    await prisma.systemConfig.deleteMany({});
  });

  it("GET /ai/status reports availability", async () => {
    await enableAi(prisma);
    const app = buildApp(prisma, userId, []);
    const res = await request(app).get("/ai/status");
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.provider).toBe("anthropic");
    expect(res.body.keyConfigured).toBe(true);
    // Never leak the key material.
    expect(JSON.stringify(res.body)).not.toContain("sk-test");
  });

  it("returns 503 when the proxy is unconfigured", async () => {
    const app = buildApp(prisma, userId, []);
    const drawing = await createDrawing(prisma, userId);
    const res = await request(app)
      .post("/ai/chat")
      .send({ drawingId: drawing.id, messages: [{ role: "user", content: "hi" }] });
    expect(res.status).toBe(503);
  });

  it("rejects agent/API-key principals", async () => {
    await enableAi(prisma);
    const drawing = await createDrawing(prisma, userId);
    const app = buildApp(prisma, userId, [], "apiKey");
    const res = await request(app)
      .post("/ai/chat")
      .send({ drawingId: drawing.id, messages: [{ role: "user", content: "hi" }] });
    expect(res.status).toBe(403);
  });

  it("runs the tool loop, applies ops, and streams SSE events", async () => {
    await enableAi(prisma);
    const drawing = await createDrawing(prisma, userId);
    scripted.queue = [
      {
        text: "",
        toolCalls: [
          {
            id: "t1",
            name: "apply_ops",
            input: { ops: [{ op: "add_shape", shape: "rectangle", x: 10, y: 20, w: 100, h: 50 }] },
          },
        ],
      },
      { text: "I added a rectangle.", toolCalls: [] },
    ];
    const emitted: Emitted[] = [];
    const app = buildApp(prisma, userId, emitted);
    const res = await request(app)
      .post("/ai/chat")
      .send({ drawingId: drawing.id, messages: [{ role: "user", content: "add a box" }] });

    expect(res.status).toBe(200);
    expect(scripted.calls).toBe(2);
    expect(res.text).toContain("event: tool_call");
    expect(res.text).toContain("event: ops_applied");
    expect(res.text).toContain("event: token");
    expect(res.text).toContain("event: done");

    // Ops persisted: version bumped and an element exists.
    const updated = await prisma.drawing.findUnique({ where: { id: drawing.id } });
    expect(updated!.version).toBeGreaterThan(drawing.version);
    const elements = parseJsonField<any[]>(updated!.elements, []);
    expect(elements.some((el) => el.type === "rectangle")).toBe(true);

    // Broadcast to the drawing room.
    expect(emitted.some((e) => e.event === "element-update" && e.room === `drawing_${drawing.id}`)).toBe(true);
  });

  it("emits an error event when the model emits an invalid op batch", async () => {
    await enableAi(prisma);
    const drawing = await createDrawing(prisma, userId);
    scripted.queue = [
      {
        text: "",
        toolCalls: [
          { id: "t1", name: "apply_ops", input: { ops: [{ op: "set_style", id: "missing", style: {} }] } },
        ],
      },
      { text: "Sorry, that element does not exist.", toolCalls: [] },
    ];
    const app = buildApp(prisma, userId, []);
    const res = await request(app)
      .post("/ai/chat")
      .send({ drawingId: drawing.id, messages: [{ role: "user", content: "style it" }] });
    expect(res.status).toBe(200);
    expect(res.text).toContain("event: error");
    expect(res.text).toContain("ELEMENT_NOT_FOUND");
  });
});
