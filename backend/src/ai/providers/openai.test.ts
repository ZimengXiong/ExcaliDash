import { afterEach, describe, expect, it, vi } from "vitest";
import { openaiAdapter, parseOpenAiToolCalls, toOpenAiMessages } from "./openai";

afterEach(() => vi.unstubAllGlobals());

describe("OpenAI-compatible conversation serialization", () => {
  it("attaches the automatic canvas image to the current user message", () => {
    const image = "data:image/png;base64,AAAA";
    expect(toOpenAiMessages("system", [{
      role: "user",
      text: "review",
      imageDataUrl: image,
      canvasState: "captured",
    }])[1]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "review" },
        { type: "image_url", image_url: { url: image } },
      ],
    });
  });

  it("captures Gemini thought signatures from responses as opaque metadata", () => {
    const signature = { google: { thought_signature: "opaque-signature" } };
    expect(
      parseOpenAiToolCalls([
        {
          id: "call-1",
          function: { name: "apply_ops", arguments: '{"ops":[]}' },
          extra_content: signature,
        },
      ]),
    ).toEqual([
      {
        id: "call-1",
        name: "apply_ops",
        input: { ops: [] },
        providerMetadata: { openaiExtraContent: signature },
      },
    ]);
  });

  it("round-trips Gemini thought signatures on function calls", () => {
    const signature = { google: { thought_signature: "opaque-signature" } };
    const messages = toOpenAiMessages("system", [
      { role: "user", text: "draw" },
      {
        role: "assistant",
        text: "",
        toolCalls: [
          {
            id: "call-1",
            name: "apply_ops",
            input: { ops: [] },
            providerMetadata: { openaiExtraContent: signature },
          },
        ],
      },
      { role: "tool_results", results: [{ id: "call-1", content: "done" }] },
    ]);

    expect(messages[2]).toMatchObject({
      role: "assistant",
      tool_calls: [{ id: "call-1", extra_content: signature }],
    });
  });

  it("places a canvas image after its tool output", () => {
    const image = "data:image/png;base64,AAAA";
    const messages = toOpenAiMessages("system", [
      {
        role: "tool_results",
        results: [{ id: "view-1", content: "attached", imageDataUrl: image }],
      },
    ]);

    expect(messages).toEqual([
      { role: "system", content: "system" },
      { role: "tool", tool_call_id: "view-1", content: "attached" },
      {
        role: "user",
        content: [
          { type: "text", text: "Current canvas snapshot requested by view_canvas." },
          { type: "image_url", image_url: { url: image } },
        ],
      },
    ]);
  });

  it("forwards a configured reasoning effort to compatible providers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "ok", tool_calls: [] } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await openaiAdapter.complete({
      settings: {
        id: "gemini",
        label: "Gemini",
        provider: "custom",
        apiKey: "secret",
        baseUrl: "https://example.test/v1",
        model: "gemini-reasoning",
        models: [],
        maxTokensPerRequest: 4096,
        keySource: "db",
        available: true,
        enabled: true,
        chatgptEnabled: true,
      },
      system: "system",
      turns: [{ role: "user", text: "think" }],
      tools: [],
      reasoningEffort: "high",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.reasoning_effort).toBe("high");
    expect(body.extra_body).toEqual({
      google: { thinking_config: { include_thoughts: true } },
    });
  });
});
