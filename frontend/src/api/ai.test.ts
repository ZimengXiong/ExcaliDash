import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  streamAgentChat,
  revertOpsBatch,
  type AgentChatHandlers,
} from "./ai";
import { api } from "./client";

vi.mock("./client", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  API_URL: "/api",
}));

vi.mock("./auth", () => ({
  ensureCsrfToken: vi.fn().mockResolvedValue(undefined),
  getCsrfHeader: vi.fn().mockReturnValue({ name: "x-csrf-token", token: "tok" }),
}));

const sseBody = (frames: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < frames.length) {
        controller.enqueue(encoder.encode(frames[i]));
        i += 1;
      } else {
        controller.close();
      }
    },
  });
};

const collectHandlers = () => {
  const tokens: string[] = [];
  const ops: any[] = [];
  const errors: any[] = [];
  let done = false;
  const handlers: AgentChatHandlers = {
    onToken: (t) => tokens.push(t),
    onOpsApplied: (e) => ops.push(e),
    onError: (e) => errors.push(e),
    onDone: () => {
      done = true;
    },
  };
  return { handlers, tokens, ops, errors, get done() {
    return done;
  } };
};

describe("streamAgentChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses interleaved SSE frames, including ones split across chunks", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        sseBody([
          'event: token\ndata: {"text":"Hello"}\n\n',
          // A frame delivered across two reads must still parse.
          'event: ops_applied\ndata: {"opsBatchId":"b1","vers',
          'ion":5,"revertVersion":4,"summaryDelta":["rect r1"]}\n\n',
          "event: done\ndata: {}\n\n",
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const c = collectHandlers();
    await streamAgentChat(
      { drawingId: "d1", messages: [{ role: "user", content: "hi" }] },
      c.handlers,
    );

    expect(c.tokens).toEqual(["Hello"]);
    expect(c.ops).toEqual([
      { opsBatchId: "b1", version: 5, revertVersion: 4, summaryDelta: ["rect r1"] },
    ]);
    expect(c.done).toBe(true);
    // CSRF header + credentials are attached.
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers["x-csrf-token"]).toBe("tok");
    expect(init.credentials).toBe("include");
  });

  it("stops parsing after the done event", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        sseBody([
          "event: done\ndata: {}\n\n",
          'event: token\ndata: {"text":"late"}\n\n',
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const c = collectHandlers();
    await streamAgentChat(
      { drawingId: "d1", messages: [{ role: "user", content: "hi" }] },
      c.handlers,
    );
    expect(c.tokens).toEqual([]);
    expect(c.done).toBe(true);
  });

  it("emits an error when the response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "AI unavailable" }), {
        status: 503,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const c = collectHandlers();
    await streamAgentChat(
      { drawingId: "d1", messages: [{ role: "user", content: "hi" }] },
      c.handlers,
    );
    expect(c.errors).toEqual([{ code: "HTTP_503", message: "AI unavailable" }]);
  });

  it("surfaces error frames with op-level details", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        sseBody([
          'event: error\ndata: {"code":"OPS_VALIDATION_FAILED","errors":[{"opIndex":0,"code":"ELEMENT_NOT_FOUND","message":"missing"}]}\n\n',
          "event: done\ndata: {}\n\n",
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const c = collectHandlers();
    await streamAgentChat(
      { drawingId: "d1", messages: [{ role: "user", content: "hi" }] },
      c.handlers,
    );
    expect(c.errors[0].code).toBe("OPS_VALIDATION_FAILED");
    expect(c.errors[0].errors[0].code).toBe("ELEMENT_NOT_FOUND");
  });
});

describe("revertOpsBatch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("posts a revert_to_snapshot op for the pre-batch version", async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { opsBatchId: "b2", version: 6, revertVersion: 5 },
    });
    const result = await revertOpsBatch("d1", 4);
    expect(api.post).toHaveBeenCalledWith("/drawings/d1/ops", {
      ops: [{ op: "revert_to_snapshot", version: 4 }],
    });
    expect(result).toEqual({ opsBatchId: "b2", version: 6, revertVersion: 5 });
  });
});
