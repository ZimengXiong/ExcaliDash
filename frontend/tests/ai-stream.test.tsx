import { afterEach, describe, expect, it, vi } from "vitest";
import { streamAiMessage } from "../src/api/ai";

vi.mock("../src/api/auth", () => ({
  ensureCsrfToken: vi.fn().mockResolvedValue(undefined),
  getCsrfHeader: () => ({ name: "x-csrf-token", token: "csrf-token" }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AI reasoning stream", () => {
  it("forwards reasoning chunks and returns the completed response", async () => {
    const done = {
      type: "done",
      conversationId: "conversation",
      messages: [
        {
          id: "assistant",
          role: "assistant",
          content: "Done",
          createdAt: "2026-11-14T00:00:00Z",
        },
      ],
      operations: [],
    };
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode('{"type":"reasoning","text":"First "}\n'),
        );
        controller.enqueue(
          encoder.encode('{"type":"reasoning","text":"second"}\n'),
        );
        controller.enqueue(encoder.encode(`${JSON.stringify(done)}\n`));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body));
    vi.stubGlobal("fetch", fetchMock);
    const onReasoning = vi.fn();

    const result = await streamAiMessage("drawing", "Hello", onReasoning);

    expect(onReasoning.mock.calls.map(([text]) => text).join("")).toBe(
      "First second",
    );
    expect(result.conversationId).toBe("conversation");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.credentials).toBe("include");
    expect(init.headers["x-csrf-token"]).toBe("csrf-token");
  });

  it("surfaces errors sent after streaming has started", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response('{"type":"error","message":"Stream failed"}\n', {
          status: 200,
        }),
      ),
    );
    await expect(streamAiMessage("drawing", "Hello", vi.fn())).rejects.toThrow(
      "Stream failed",
    );
  });
});
