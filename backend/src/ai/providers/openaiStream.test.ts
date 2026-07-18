import { describe, expect, it, vi } from "vitest";
import { readOpenAiStream } from "./openaiStream";

const sseResponse = (chunks: unknown[]) => new Response(
  `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`,
  { headers: { "content-type": "text/event-stream" } },
);

describe("readOpenAiStream", () => {
  it("separates reasoning summaries from answer text and keeps tool metadata", async () => {
    const onThinking = vi.fn();
    const onText = vi.fn();
    const signature = { google: { thought_signature: "opaque" } };
    const result = await readOpenAiStream(sseResponse([
      { choices: [{ delta: { reasoning_content: "Checking layout." } }] },
      { choices: [{ delta: { content: "Done." } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "call-1", function: { name: "apply_ops", arguments: "{\"ops\":" }, extra_content: signature }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "[]}" } }] } }] },
    ]), undefined, onText, onThinking);

    expect(onThinking).toHaveBeenCalledWith("Checking layout.");
    expect(onText).toHaveBeenCalledWith("Done.");
    expect(result.text).toBe("Done.");
    expect(result.toolCalls).toEqual([{
      id: "call-1",
      name: "apply_ops",
      input: { ops: [] },
      providerMetadata: { openaiExtraContent: signature },
    }]);
  });
});
