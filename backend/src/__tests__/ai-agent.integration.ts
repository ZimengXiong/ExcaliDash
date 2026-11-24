import express from "express";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { PrismaClient } from "../generated/client";
import { registerAiRoutes } from "../routes/ai";
import type { AiResponse } from "../ai/operations";
import { asyncHandler, errorHandler } from "../middleware/errorHandler";
import {
  createTestUser,
  getTestPrisma,
  initTestDb,
  setupTestDb,
} from "./testUtils";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs = 2000,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("Timed out")), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

describe("board AI conversations", () => {
  let prisma: PrismaClient;
  let app: express.Express;
  let drawingId: string;
  let owner: Awaited<ReturnType<typeof initTestDb>>;
  let viewer: Awaited<ReturnType<typeof createTestUser>>;
  const requestKimi = vi.fn();
  const streamKimi = vi.fn();
  const kimi = {
    apiKey: "test-key",
    baseUrl: "https://api.moonshot.ai/v1",
    model: "kimi-k3.1-pro",
    reasoningEffort: "high" as const,
    timeoutMs: 180000,
  };

  beforeAll(async () => {
    setupTestDb();
    prisma = getTestPrisma();
    owner = await initTestDb(prisma);
    viewer = await createTestUser(prisma, "viewer@example.com");
    const drawing = await prisma.drawing.create({
      data: {
        name: "AI Board",
        userId: owner.id,
        elements: JSON.stringify([
          { id: "existing", type: "rectangle", x: 0, y: 0 },
        ]),
        appState: JSON.stringify({ viewBackgroundColor: "#ffffff" }),
      },
    });
    drawingId = drawing.id;

    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const actor = req.get("x-test-user-id") === viewer.id ? viewer : owner;
      req.user = {
        id: actor.id,
        email: actor.email,
        name: actor.name,
        role: actor.role,
      };
      next();
    });
    registerAiRoutes(app, {
      prisma,
      requireAuth: (_req, _res, next) => next(),
      asyncHandler,
      kimi,
      requestKimi: requestKimi as any,
      streamKimi: streamKimi as any,
    });
    app.use(errorHandler);
  });

  beforeEach(async () => {
    requestKimi.mockReset();
    streamKimi.mockReset();
    kimi.apiKey = "test-key";
    await prisma.drawingPermission.deleteMany({
      where: { drawingId, granteeUserId: viewer.id },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const grantViewer = (permission: "view" | "edit") =>
    prisma.drawingPermission.create({
      data: {
        drawingId,
        granteeUserId: viewer.id,
        permission,
        createdByUserId: owner.id,
      },
    });

  it("shares persistent history and sends recent context to Kimi", async () => {
    requestKimi.mockResolvedValueOnce({
      message: "Created a rectangle",
      operations: [
        {
          type: "create",
          elements: [{ type: "rectangle", x: 100, y: 100 }],
        },
      ],
    });
    const first = await request(app)
      .post(`/drawings/${drawingId}/ai/messages`)
      .send({ message: "Add a rectangle" });
    expect(first.status).toBe(200);
    expect(first.body.messages).toHaveLength(2);
    expect(first.body.operations).toHaveLength(1);
    expect(requestKimi.mock.calls[0][1]).toEqual([]);

    requestKimi.mockResolvedValueOnce({
      message: "Changed it",
      operations: [],
    });
    const second = await request(app)
      .post(`/drawings/${drawingId}/ai/messages`)
      .send({ message: "Make it blue" });
    expect(second.status).toBe(200);
    const history = requestKimi.mock.calls[1][1];
    expect(history).toHaveLength(2);
    expect(history[0].content).toBe("Add a rectangle");
    expect(JSON.parse(history[1].operations)).toHaveLength(1);

    const conversation = await request(app).get(
      `/drawings/${drawingId}/ai/conversation`,
    );
    expect(conversation.status).toBe(200);
    expect(conversation.body.messages).toHaveLength(4);

    const cleared = await request(app).delete(
      `/drawings/${drawingId}/ai/conversation`,
    );
    expect(cleared.status).toBe(200);
    const empty = await request(app).get(
      `/drawings/${drawingId}/ai/conversation`,
    );
    expect(empty.body).toEqual({ conversationId: null, messages: [] });
  });

  it("reports missing configuration without calling Kimi", async () => {
    kimi.apiKey = null;
    const response = await request(app)
      .post(`/drawings/${drawingId}/ai/messages`)
      .send({ message: "Hello" });
    expect(response.status).toBe(503);
    expect(response.body.message).toContain("KIMI_API_KEY");
    expect(requestKimi).not.toHaveBeenCalled();
  });

  it("streams reasoning events before the saved response", async () => {
    streamKimi.mockImplementation(async (...args) => {
      args[4]("Checking the board");
      return { message: "No changes needed", operations: [] };
    });
    const response = await request(app)
      .post(`/drawings/${drawingId}/ai/messages/stream`)
      .send({ message: "Is the board empty?" });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/x-ndjson");
    expect(response.headers["x-accel-buffering"]).toBe("no");
    const events = response.text.trim().split("\n").map(JSON.parse);
    expect(events[0]).toEqual({
      type: "reasoning",
      text: "Checking the board",
    });
    expect(events.at(-1).type).toBe("done");
    expect(events.at(-1).messages[1].content).toBe("No changes needed");
    expect(events.at(-1).messages[1].reasoning).toBe("Checking the board");
  });

  it("accepts native frames with new and existing children", async () => {
    requestKimi.mockResolvedValue({
      message: "Created a native frame",
      operations: [
        {
          type: "create",
          elements: [
            {
              id: "new-child",
              type: "rectangle",
              x: 100,
              y: 100,
              width: 200,
              height: 100,
            },
            {
              id: "native-frame",
              type: "frame",
              name: "Frame",
              x: 50,
              y: 50,
              width: 500,
              height: 400,
              children: ["new-child", "existing"],
            },
          ],
        },
      ],
    });
    const response = await request(app)
      .post(`/drawings/${drawingId}/ai/messages`)
      .send({ message: "Create a frame" });
    expect(response.status).toBe(200);
    expect(response.body.operations[0].elements[1].type).toBe("frame");
  });

  it("rejects operations targeting invented element IDs", async () => {
    const messageCountBefore = await prisma.aiMessage.count();
    requestKimi.mockResolvedValue({
      message: "Updated",
      operations: [
        { type: "update", elementId: "invented", changes: { x: 10 } },
      ],
    });
    const response = await request(app)
      .post(`/drawings/${drawingId}/ai/messages`)
      .send({ message: "Move a missing element" });
    expect(response.status).toBe(502);
    expect(await prisma.aiMessage.count()).toBe(messageCountBefore);
  });

  it("does not save a completed response after the requester loses edit access", async () => {
    await grantViewer("edit");
    const messageCountBefore = await prisma.aiMessage.count();
    const completion = deferred<AiResponse>();
    requestKimi.mockReturnValueOnce(completion.promise);
    const pending = request(app)
      .post(`/drawings/${drawingId}/ai/messages`)
      .set("x-test-user-id", viewer.id)
      .send({ message: "Secret edit request" })
      .then((response) => response);
    await vi.waitFor(() => expect(requestKimi).toHaveBeenCalledOnce());

    await prisma.drawingPermission.deleteMany({
      where: { drawingId, granteeUserId: viewer.id },
    });
    completion.resolve({ message: "Must not be saved", operations: [] });
    const response = await pending;

    expect(response.status).toBe(404);
    expect(await prisma.aiMessage.count()).toBe(messageCountBefore);
  });

  it("does not publish a streamed response after the requester loses edit access", async () => {
    await grantViewer("edit");
    const messageCountBefore = await prisma.aiMessage.count();
    const completion = deferred<AiResponse>();
    let emitReasoning!: (text: string) => void;
    streamKimi.mockImplementationOnce((...args) => {
      emitReasoning = args[4];
      return completion.promise;
    });
    const pending = request(app)
      .post(`/drawings/${drawingId}/ai/messages/stream`)
      .set("x-test-user-id", viewer.id)
      .send({ message: "Secret streaming request" })
      .then((response) => response);
    await vi.waitFor(() => expect(streamKimi).toHaveBeenCalledOnce());

    await prisma.drawingPermission.deleteMany({
      where: { drawingId, granteeUserId: viewer.id },
    });
    emitReasoning("Hidden reasoning after revocation");
    completion.resolve({ message: "Must not be streamed", operations: [] });
    const response = await pending;

    expect(response.status).toBe(200);
    expect(response.text).toContain("no longer have permission");
    expect(response.text).not.toContain("Hidden reasoning after revocation");
    expect(response.text).not.toContain("Must not be streamed");
    expect(await prisma.aiMessage.count()).toBe(messageCountBefore);
  });

  it("closes SSE without publishing new messages after view access is revoked", async () => {
    await grantViewer("view");
    const server = app.listen(0, "127.0.0.1");
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      await new Promise<void>((resolve) => server.once("listening", resolve));
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Test server did not bind to a TCP port");
      }
      const response = await fetch(
        `http://127.0.0.1:${address.port}/drawings/${drawingId}/ai/events`,
        { headers: { "x-test-user-id": viewer.id } },
      );
      expect(response.status).toBe(200);
      reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let received = "";
      await withTimeout(
        (async () => {
          while (!received.includes("\n\n")) {
            const chunk = await reader!.read();
            if (chunk.done) break;
            received += decoder.decode(chunk.value, { stream: true });
          }
        })(),
      );
      expect(received).toContain('"type":"snapshot"');

      await prisma.drawingPermission.deleteMany({
        where: { drawingId, granteeUserId: viewer.id },
      });
      requestKimi.mockResolvedValueOnce({
        message: "Hidden after revocation",
        operations: [],
      });
      const ownerResponse = await request(app)
        .post(`/drawings/${drawingId}/ai/messages`)
        .send({ message: "New private exchange" });
      expect(ownerResponse.status).toBe(200);

      await withTimeout(
        (async () => {
          while (true) {
            const chunk = await reader!.read();
            if (chunk.done) break;
            received += decoder.decode(chunk.value, { stream: true });
          }
        })(),
      );
      expect(received).not.toContain("Hidden after revocation");
      expect(received).not.toContain("New private exchange");
    } finally {
      if (reader) await reader.cancel().catch(() => undefined);
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
