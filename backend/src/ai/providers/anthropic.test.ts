import { afterEach, describe, expect, it, vi } from "vitest";
import { anthropicAdapter } from "./anthropic";

afterEach(() => vi.unstubAllGlobals());

describe("Anthropic provider", () => {
  it("forwards configured effort through output_config", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: "text", text: "ok" }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await anthropicAdapter.complete({
      settings: {
        id: "claude",
        label: "Claude",
        provider: "anthropic",
        apiKey: "secret",
        baseUrl: "https://api.anthropic.com/v1",
        model: "claude-opus-4-8",
        models: [],
        maxTokensPerRequest: 4096,
        keySource: "db",
        available: true,
        enabled: true,
        chatgptEnabled: true,
      },
      system: "system",
      turns: [{
        role: "user",
        text: "think",
        imageDataUrl: "data:image/png;base64,AAAA",
        canvasState: "captured",
      }],
      tools: [],
      reasoningEffort: "xhigh",
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.output_config).toEqual({ effort: "xhigh" });
    expect(body.thinking).toEqual({ type: "adaptive", display: "summarized" });
    expect(body.messages[0].content).toEqual([
      { type: "text", text: "think" },
      {
        type: "image",
        source: { type: "base64", media_type: "image/png", data: "AAAA" },
      },
    ]);
  });
});
