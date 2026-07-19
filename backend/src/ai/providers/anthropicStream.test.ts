import { describe, expect, it, vi } from "vitest";
import { readAnthropicStream } from "./anthropicStream";

const sseResponse = (events: unknown[]) => new Response(
  events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
  { headers: { "content-type": "text/event-stream" } },
);

describe("readAnthropicStream", () => {
  it("streams summarized thinking, text, and preserves signed thinking blocks", async () => {
    const onThinking = vi.fn();
    const onText = vi.fn();
    const result = await readAnthropicStream(sseResponse([
      { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Inspecting layout." } },
      { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "opaque" } },
      { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Looks good." } },
    ]), undefined, onText, onThinking);

    expect(onThinking).toHaveBeenCalledWith("Inspecting layout.");
    expect(onText).toHaveBeenCalledWith("Looks good.");
    expect(result.text).toBe("Looks good.");
    expect(result.thinkingBlocks).toEqual([{
      type: "thinking",
      thinking: "Inspecting layout.",
      signature: "opaque",
    }]);
  });

  it("parses CRLF SSE frames and multi-line data payloads", async () => {
    const response = new Response(
      'event: content_block_start\r\ndata: {"type":"content_block_start","index":0,\r\ndata: "content_block":{"type":"text","text":"hello"}}\r\n\r\n',
      { headers: { "content-type": "text/event-stream" } },
    );
    await expect(readAnthropicStream(response)).resolves.toMatchObject({
      text: "hello",
      toolCalls: [],
    });
  });
});
