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
import { encodeStoredAiProfiles } from "./settings";
const scripted = vi.hoisted(() => ({ queue: [] as any[], calls: 0, requests: [] as any[] }));
vi.mock("./providers/anthropic", () => ({
  anthropicAdapter: {
    complete: async (req: any) => {
      scripted.calls += 1;
      scripted.requests.push(req);
      const next = scripted.queue.shift() ?? { text: "", toolCalls: [] };
      for (const delta of next.thinkingDeltas ?? []) req.onThinkingDelta?.(delta);
      for (const delta of next.textDeltas ?? []) req.onTextDelta?.(delta);
      return next;
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
    scripted.requests = [];
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
    expect(JSON.stringify(res.body)).not.toContain("sk-test");
  });
  it("clears a drawing chat and broadcasts the change", async () => {
    await enableAi(prisma);
    const drawing = await createDrawing(prisma, userId);
    await prisma.drawingChatMessage.create({
      data: {
        drawingId: drawing.id,
        turnId: `turn-${drawing.id}`,
        role: "user",
        content: "Please draw a box",
      },
    });
    const emitted: Emitted[] = [];
    const app = buildApp(prisma, userId, emitted);

    const cleared = await request(app).delete(
      `/ai/chat/${drawing.id}/messages`,
    );

    expect(cleared.status).toBe(204);
    expect(
      await prisma.drawingChatMessage.count({
        where: { drawingId: drawing.id },
      }),
    ).toBe(0);
    expect(emitted).toContainEqual({
      room: `drawing_${drawing.id}`,
      event: "ai-chat-cleared",
      payload: { drawingId: drawing.id },
    });
  });
  it("prompts users to connect the built-in ChatGPT provider", async () => {
    const app = buildApp(prisma, userId, []);
    const drawing = await createDrawing(prisma, userId);
    const res = await request(app)
      .post("/ai/chat")
      .send({ drawingId: drawing.id, messages: [{ role: "user", content: "hi" }] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CHATGPT_RECONNECT");
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
    expect(res.text).toContain("event: tool_result");
    expect(res.text).toContain("event: ops_applied");
    expect(res.text).toContain("event: token");
    expect(res.text).toContain("event: done");
    const updated = await prisma.drawing.findUnique({ where: { id: drawing.id } });
    expect(updated!.version).toBeGreaterThan(drawing.version);
    const elements = parseJsonField<any[]>(updated!.elements, []);
    expect(elements.some((el) => el.type === "rectangle")).toBe(true);
    expect(emitted.some((e) => e.event === "element-update" && e.room === `drawing_${drawing.id}`)).toBe(true);
  });
  it("recovers when a drawing model exhausts its budget while only thinking", async () => {
    await enableAi(prisma);
    const drawing = await createDrawing(prisma, userId);
    scripted.queue = [
      {
        text: "",
        toolCalls: [],
        thinkingDeltas: ["Planning coordinates until the response ends..."],
        finishReason: "length",
      },
      {
        text: "",
        toolCalls: [
          {
            id: "recovered-draw",
            name: "apply_ops",
            input: {
              ops: [
                {
                  op: "add_shape",
                  shape: "ellipse",
                  x: 20,
                  y: 30,
                  w: 120,
                  h: 80,
                },
              ],
            },
          },
        ],
      },
      { text: "I drew it.", toolCalls: [], finishReason: "stop" },
    ];

    const res = await request(buildApp(prisma, userId, []))
      .post("/ai/chat")
      .send({
        drawingId: drawing.id,
        message: "Draw a penguin",
        clientRequestId: `recover-${drawing.id}`,
      });

    expect(res.status).toBe(200);
    expect(scripted.calls).toBe(3);
    expect(scripted.requests[0].toolChoice).toBe("required");
    expect(scripted.requests[0].tools.map((tool: any) => tool.name)).toEqual([
      "apply_ops",
    ]);
    expect(scripted.requests[2].toolChoice).toBe("auto");
    expect(
      scripted.requests[1].turns.some(
        (turn: any) =>
          turn.role === "user" &&
          turn.text.includes("Call apply_ops immediately"),
      ),
    ).toBe(true);
    expect(res.text).toContain("event: ops_applied");
    expect(res.text).toContain("I drew it.");
    expect(res.text).toContain("event: done");

    const messages = await prisma.drawingChatMessage.findMany({
      where: { drawingId: drawing.id },
      orderBy: { position: "asc" },
    });
    expect(messages[1]).toMatchObject({
      status: "complete",
      providerMetadata: expect.stringContaining('"finishReason":"stop"'),
    });
  });
  it("reports an error when thinking-only recovery still produces no result", async () => {
    await enableAi(prisma);
    const drawing = await createDrawing(prisma, userId);
    scripted.queue = [
      { text: "", toolCalls: [], finishReason: "length" },
      { text: "", toolCalls: [], finishReason: "length" },
    ];

    const res = await request(buildApp(prisma, userId, []))
      .post("/ai/chat")
      .send({
        drawingId: drawing.id,
        message: "Draw a tree",
        clientRequestId: `empty-${drawing.id}`,
      });

    expect(scripted.calls).toBe(2);
    expect(res.text).toContain("EMPTY_MODEL_RESPONSE");
    expect(res.text).not.toContain("event: done");
    const assistant = await prisma.drawingChatMessage.findFirst({
      where: { drawingId: drawing.id, role: "assistant" },
    });
    expect(assistant).toMatchObject({
      status: "error",
      error: expect.stringContaining("stopped after thinking"),
    });
  });
  it("streams thinking summaries independently from answer tokens", async () => {
    await enableAi(prisma);
    const drawing = await createDrawing(prisma, userId);
    scripted.queue = [{
      text: "Done.",
      toolCalls: [],
      thinkingDeltas: ["Inspecting ", "the canvas."],
      textDeltas: ["Done."],
      streamedText: true,
    }];
    const res = await request(buildApp(prisma, userId, []))
      .post("/ai/chat")
      .send({ drawingId: drawing.id, messages: [{ role: "user", content: "review" }] });
    expect(res.status).toBe(200);
    expect(res.text).toContain("event: thinking");
    expect(res.text).toContain('{"text":"Inspecting "}');
    expect(res.text).toContain('{"text":"the canvas."}');
    expect(res.text.match(/event: token/g)).toHaveLength(1);
  });
  it("persists one shared drawing transcript and uses it as server-owned context", async () => {
    await enableAi(prisma);
    const drawing = await createDrawing(prisma, userId);
    const collaborator = await prisma.user.create({
      data: {
        email: `collaborator-${drawing.id}@t`,
        name: "Collaborator",
        passwordHash: "x",
      },
    });
    await prisma.drawingPermission.create({
      data: {
        drawingId: drawing.id,
        granteeUserId: collaborator.id,
        permission: "edit",
        createdByUserId: userId,
      },
    });
    scripted.queue = [
      { text: "First answer.", toolCalls: [] },
      { text: "Second answer.", toolCalls: [] },
    ];
    const emitted: Emitted[] = [];
    const ownerApp = buildApp(prisma, userId, emitted);
    const first = await request(ownerApp).post("/ai/chat").send({
      drawingId: drawing.id,
      message: "First question",
      clientRequestId: `request-${drawing.id}-1`,
    });
    expect(first.status).toBe(200);
    const duplicate = await request(ownerApp).post("/ai/chat").send({
      drawingId: drawing.id,
      message: "First question",
      clientRequestId: `request-${drawing.id}-1`,
    });
    expect(duplicate.status).toBe(200);
    expect(scripted.calls).toBe(1);
    const collaboratorApp = buildApp(prisma, collaborator.id, emitted);
    const shared = await request(collaboratorApp)
      .get(`/ai/chat/${drawing.id}/messages`);
    expect(shared.status).toBe(200);
    expect(shared.body.messages).toMatchObject([
      { role: "user", text: "First question", author: { name: "Owner" } },
      { role: "assistant", text: "First answer.", status: "complete" },
    ]);
    const second = await request(collaboratorApp).post("/ai/chat").send({
      drawingId: drawing.id,
      message: "Second question",
      clientRequestId: `request-${drawing.id}-2`,
    });
    expect(second.status).toBe(200);
    expect(scripted.requests[1].turns.slice(0, 2)).toEqual([
      { role: "user", text: "First question" },
      { role: "assistant", text: "First answer.", toolCalls: [] },
    ]);
    expect(scripted.requests[1].turns[2]).toMatchObject({
      role: "user",
      canvasState: "unavailable",
    });
    expect(scripted.requests[1].turns[2].text).toContain("Second question");
    expect(scripted.requests[1].signal).toBeInstanceOf(AbortSignal);
    const refreshed = await request(ownerApp)
      .get(`/ai/chat/${drawing.id}/messages`);
    expect(refreshed.body.messages).toHaveLength(4);
    expect(refreshed.body.messages[2]).toMatchObject({
      role: "user",
      text: "Second question",
      author: { name: "Collaborator" },
    });
    expect(emitted.some((event) => event.event === "ai-chat-message")).toBe(true);
    expect(emitted.some((event) => event.event === "ai-chat-event")).toBe(true);
  });
  it("selects a configured provider profile, model, and reasoning effort", async () => {
    const aiProviderProfiles = encodeStoredAiProfiles([
      {
        id: "primary",
        label: "Primary",
        provider: "anthropic",
        enabled: true,
        baseUrl: null,
        models: [{ id: "claude-a", label: "Claude A", reasoningEfforts: [] }],
        apiKey: "sk-a",
      },
      {
        id: "reviewer",
        label: "Reviewer",
        provider: "anthropic",
        enabled: true,
        baseUrl: null,
        models: [{ id: "claude-b", label: "Claude B", reasoningEfforts: ["high"] }],
        apiKey: "sk-b",
      },
    ]);
    await prisma.systemConfig.upsert({
      where: { id: "default" },
      update: { aiProviderProfiles, aiDefaultProviderId: "primary" },
      create: { id: "default", aiProviderProfiles, aiDefaultProviderId: "primary" },
    });
    scripted.queue = [{ text: "Using the reviewer.", toolCalls: [] }];
    const drawing = await createDrawing(prisma, userId);
    const res = await request(buildApp(prisma, userId, []))
      .post("/ai/chat")
      .send({
        drawingId: drawing.id,
        providerId: "reviewer",
        model: "claude-b",
        reasoningEffort: "high",
        messages: [{ role: "user", content: "review this" }],
      });
    expect(res.status).toBe(200);
    expect(scripted.requests[0].settings).toMatchObject({
      id: "reviewer",
      model: "claude-b",
      apiKey: "sk-b",
    });
    expect(scripted.requests[0].reasoningEffort).toBe("high");
  });
  it("provides a live canvas image through view_canvas", async () => {
    await enableAi(prisma);
    const drawing = await createDrawing(prisma, userId);
    scripted.queue = [
      {
        text: "",
        toolCalls: [{ id: "view-1", name: "view_canvas", input: {} }],
      },
      { text: "I inspected the layout.", toolCalls: [] },
    ];
    const app = buildApp(prisma, userId, []);
    const image = "data:image/png;base64,AAAA";
    const res = await request(app)
      .post("/ai/chat")
      .send({
        drawingId: drawing.id,
        messages: [{ role: "user", content: "inspect it" }],
        canvasImage: image,
        canvasState: "captured",
      });
    expect(res.status).toBe(200);
    expect(scripted.requests[0].turns[0]).toMatchObject({
      role: "user",
      imageDataUrl: image,
      canvasState: "captured",
    });
    expect(scripted.requests[0].turns[0].text).toContain(
      "A current canvas image is attached",
    );
    expect(res.text).toContain('"name":"view_canvas"');
    expect(
      scripted.requests[1].turns.find((turn: any) => turn.role === "tool_results"),
    ).toEqual({
      role: "tool_results",
      results: [
        expect.objectContaining({
          id: "view-1",
          content: "The current snapshot was already attached to the user message.",
        }),
      ],
    });
  });
  it("treats a blank canvas as valid context instead of a capture failure", async () => {
    await enableAi(prisma);
    const drawing = await createDrawing(prisma, userId);
    scripted.queue = [
      { text: "", toolCalls: [{ id: "view-blank", name: "view_canvas", input: {} }] },
      { text: "The canvas is blank and ready.", toolCalls: [] },
    ];
    const res = await request(buildApp(prisma, userId, []))
      .post("/ai/chat")
      .send({
        drawingId: drawing.id,
        message: "What is here?",
        canvasState: "blank",
      });
    expect(res.status).toBe(200);
    expect(scripted.requests[0].turns[0]).toMatchObject({
      role: "user",
      canvasState: "blank",
    });
    expect(scripted.requests[0].turns[0].text).toContain(
      "intentionally blank (0 elements)",
    );
    expect(res.text).toContain('"ok":true');
    expect(res.text).toContain("Canvas is blank (0 elements)");
  });
  it("stops repeated identical tool calls before they become a doom loop", async () => {
    await enableAi(prisma);
    const drawing = await createDrawing(prisma, userId);
    scripted.queue = Array.from({ length: 3 }, (_, index) => ({
      text: "",
      toolCalls: [{ id: `unknown-${index}`, name: "unknown_tool", input: {} }],
    }));
    const app = buildApp(prisma, userId, []);
    const res = await request(app)
      .post("/ai/chat")
      .send({ drawingId: drawing.id, messages: [{ role: "user", content: "loop" }] });
    expect(res.text).toContain("REPEATED_TOOL_CALL");
    expect(res.text).not.toContain("event: done");
  });
  it("returns invalid ops as recoverable tool results", async () => {
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
    expect(res.text).toContain("event: tool_result");
    expect(res.text).toContain('"ok":false');
    expect(res.text).toContain("event: done");
  });
});
