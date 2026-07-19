import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildOpenAiTokenLimit,
  buildOpenAiReasoningParameters,
  openaiAdapter,
  parseOpenAiToolCalls,
  toOpenAiMessages,
} from "./openai";

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

  it("uses only Gemini thinking_config for Gemini 3 reasoning", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "ok", tool_calls: [] } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await openaiAdapter.complete({
      settings: {
        id: "gemini",
        label: "Gemini",
        provider: "gemini",
        apiKey: "secret",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        model: "gemini-3-flash-preview",
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
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(body.extra_body).toEqual({
      google: {
        thinking_config: {
          thinking_level: "high",
          include_thoughts: true,
        },
      },
    });
  });

  it("maps the reproduced Gemini 3 Flash Preview low request without duplicate controls", () => {
    const params = buildOpenAiReasoningParameters({
      id: "gemini",
      label: "Gemini",
      provider: "gemini",
      apiKey: "secret",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: "gemini-3-flash-preview",
      models: [],
      maxTokensPerRequest: 4096,
      keySource: "db",
      available: true,
      enabled: true,
      chatgptEnabled: true,
    }, "low");

    expect(params).not.toHaveProperty("reasoning_effort");
    expect(params).toEqual({
      extra_body: {
        google: {
          thinking_config: {
            thinking_level: "low",
            include_thoughts: true,
          },
        },
      },
    });
  });

  it("maps Gemini 2.5 reasoning levels to documented thinking budgets", () => {
    const settings = {
      id: "gemini",
      label: "Gemini",
      provider: "gemini" as const,
      apiKey: "secret",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: "gemini-2.5-flash",
      models: [],
      maxTokensPerRequest: 4096,
      keySource: "db" as const,
      available: true,
      enabled: true,
      chatgptEnabled: true,
    };

    expect(buildOpenAiReasoningParameters(settings, "medium")).toMatchObject({
      extra_body: {
        google: { thinking_config: { thinking_budget: 8192 } },
      },
    });
    expect(buildOpenAiReasoningParameters(settings, "none")).toMatchObject({
      extra_body: {
        google: { thinking_config: { thinking_budget: 0 } },
      },
    });
  });

  it("keeps standard reasoning_effort for non-Gemini providers", () => {
    expect(buildOpenAiReasoningParameters({
      id: "openai",
      label: "OpenAI",
      provider: "openai",
      apiKey: "secret",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5.4",
      models: [],
      maxTokensPerRequest: 4096,
      keySource: "db",
      available: true,
      enabled: true,
      chatgptEnabled: true,
    }, "high")).toEqual({ reasoning_effort: "high" });
  });

  it("uses max_completion_tokens for OpenAI and legacy max_tokens for compatible dialects", () => {
    const base = {
      id: "provider",
      label: "Provider",
      apiKey: "secret",
      baseUrl: "https://example.test/v1",
      model: "model",
      models: [],
      maxTokensPerRequest: 4096,
      keySource: "db" as const,
      available: true,
      enabled: true,
      chatgptEnabled: true,
    };
    expect(buildOpenAiTokenLimit({ ...base, provider: "openai" })).toEqual({
      max_completion_tokens: 4096,
    });
    expect(buildOpenAiTokenLimit({ ...base, provider: "custom" })).toEqual({
      max_tokens: 4096,
    });
    expect(buildOpenAiTokenLimit({ ...base, provider: "opencode_go" })).toEqual({
      max_tokens: 4096,
    });
  });

  it("does not forward OpenAI reasoning controls to OpenCode Go", () => {
    expect(buildOpenAiReasoningParameters({
      id: "go",
      label: "OpenCode Go",
      provider: "opencode_go",
      apiKey: "secret",
      baseUrl: "https://opencode.ai/zen/go/v1",
      model: "kimi-k3",
      models: [],
      maxTokensPerRequest: 4096,
      keySource: "db",
      available: true,
      enabled: true,
      chatgptEnabled: true,
    }, "high")).toEqual({});
  });

  it("preserves provider HTTP status for normalized upstream errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response('{"error":{"message":"invalid key"}}', { status: 401 }),
    ));
    await expect(openaiAdapter.complete({
      settings: {
        id: "openai",
        label: "OpenAI",
        provider: "openai",
        apiKey: "bad",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-5.6-sol",
        models: [],
        maxTokensPerRequest: 4096,
        keySource: "db",
        available: true,
        enabled: true,
        chatgptEnabled: true,
      },
      system: "system",
      turns: [{ role: "user", text: "hello" }],
      tools: [],
    })).rejects.toMatchObject({ status: 401 });
  });
});
