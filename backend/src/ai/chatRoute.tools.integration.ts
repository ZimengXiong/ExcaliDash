import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { PrismaClient } from "../generated/client";
import {
  cleanupTestDb,
  getTestPrisma,
  initTestDb,
  setupTestDb,
} from "../__tests__/testUtils";
import { encryptSecret } from "./crypto";
import { encodeStoredAiProfiles } from "./settings";

const scripted = vi.hoisted(() => ({
  queue: [] as any[],
  requests: [] as any[],
}));
vi.mock("./providers/anthropic", () => ({
  anthropicAdapter: {
    complete: async (req: any) => {
      scripted.requests.push(req);
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

const buildApp = (prisma: PrismaClient, userId: string) => {
  const app = express();
  app.use(express.json());
  registerAiRoutes(app, {
    prisma,
    requireAuth: (req: any, _res: any, next: any) => {
      req.user = {
        id: userId,
        email: "u@t",
        name: "U",
        role: "USER",
        authCredentialType: "jwt",
      };
      req.principal = { kind: "user", userId };
      next();
    },
    asyncHandler:
      (fn: any) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
    parseJsonField,
    invalidateDrawingsCache: () => {},
    logAuditEvent: async () => {},
    defaultSystemConfigId: "default",
  });
  return app;
};

const createDrawing = (prisma: PrismaClient, userId: string) =>
  prisma.drawing.create({
    data: {
      name: "AI Tool Test",
      elements: JSON.stringify([]),
      appState: JSON.stringify({ viewBackgroundColor: "#ffffff" }),
      files: JSON.stringify({}),
      userId,
    },
  });

const enableAi = (prisma: PrismaClient) =>
  prisma.systemConfig.upsert({
    where: { id: "default" },
    update: {
      aiProvider: "anthropic",
      aiApiKeyEncrypted: encryptSecret("sk-test"),
    },
    create: {
      id: "default",
      aiProvider: "anthropic",
      aiApiKeyEncrypted: encryptSecret("sk-test"),
    },
  });

describe("ai/chatRoute provider selection and canvas tools", () => {
  let prisma: PrismaClient;
  let userId: string;

  beforeAll(async () => {
    setupTestDb();
    prisma = getTestPrisma();
    await initTestDb(prisma);
    const user = await prisma.user.create({
      data: { email: "tool-owner@t", name: "Owner", passwordHash: "x" },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await cleanupTestDb(prisma);
  });

  beforeEach(async () => {
    scripted.queue = [];
    scripted.requests = [];
    await prisma.systemConfig.deleteMany({});
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
        models: [
          { id: "claude-b", label: "Claude B", reasoningEfforts: ["high"] },
        ],
        apiKey: "sk-b",
      },
    ]);
    await prisma.systemConfig.upsert({
      where: { id: "default" },
      update: { aiProviderProfiles, aiDefaultProviderId: "primary" },
      create: {
        id: "default",
        aiProviderProfiles,
        aiDefaultProviderId: "primary",
      },
    });
    scripted.queue = [{ text: "Using the reviewer.", toolCalls: [] }];
    const drawing = await createDrawing(prisma, userId);
    const res = await request(buildApp(prisma, userId))
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
    const image = "data:image/png;base64,AAAA";
    const res = await request(buildApp(prisma, userId))
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
      scripted.requests[1].turns.find(
        (turn: any) => turn.role === "tool_results",
      ),
    ).toEqual({
      role: "tool_results",
      results: [
        expect.objectContaining({
          id: "view-1",
          content:
            "The current snapshot was already attached to the user message.",
        }),
      ],
    });
  });

  it("treats a blank canvas as valid context instead of a capture failure", async () => {
    await enableAi(prisma);
    const drawing = await createDrawing(prisma, userId);
    scripted.queue = [
      {
        text: "",
        toolCalls: [{ id: "view-blank", name: "view_canvas", input: {} }],
      },
      { text: "The canvas is blank and ready.", toolCalls: [] },
    ];
    const res = await request(buildApp(prisma, userId))
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
      toolCalls: [
        { id: `unknown-${index}`, name: "unknown_tool", input: {} },
      ],
    }));
    const res = await request(buildApp(prisma, userId))
      .post("/ai/chat")
      .send({
        drawingId: drawing.id,
        messages: [{ role: "user", content: "loop" }],
      });
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
          {
            id: "t1",
            name: "apply_ops",
            input: {
              ops: [
                {
                  op: "set_style",
                  id: "missing",
                  style: {},
                },
              ],
            },
          },
        ],
      },
      { text: "Sorry, that element does not exist.", toolCalls: [] },
    ];
    const res = await request(buildApp(prisma, userId))
      .post("/ai/chat")
      .send({
        drawingId: drawing.id,
        messages: [{ role: "user", content: "style it" }],
      });
    expect(res.status).toBe(200);
    expect(res.text).toContain("event: tool_result");
    expect(res.text).toContain('"ok":false');
    expect(res.text).toContain("event: done");
  });
});
