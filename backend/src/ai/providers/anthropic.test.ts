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

  it("requires a tool on canvas mutation turns", async () => {
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
        maxTokensPerRequest: 32_000,
        keySource: "db",
        available: true,
        enabled: true,
        chatgptEnabled: true,
      },
      system: "system",
      turns: [{ role: "user", text: "draw" }],
      tools: [],
      toolChoice: "required",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.tool_choice).toEqual({ type: "any" });
  });

  it("does not send Anthropic-only effort controls through OpenCode Go", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: "text", text: "ok" }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await anthropicAdapter.complete({
      settings: {
        id: "go",
        label: "OpenCode Go",
        provider: "opencode_go",
        apiKey: "secret",
        baseUrl: "https://opencode.ai/zen/go/v1",
        model: "minimax-m3",
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
    expect(body).not.toHaveProperty("output_config");
    expect(body).not.toHaveProperty("thinking");
  });

  it("preserves signed thinking blocks in non-streamed responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      content: [
        { type: "thinking", thinking: "summary", signature: "opaque" },
        { type: "text", text: "done" },
      ],
    }), { status: 200 })));
    const result = await anthropicAdapter.complete({
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
      turns: [{ role: "user", text: "think" }],
      tools: [],
    });
    expect(result.assistantMetadata).toEqual({
      anthropicThinkingBlocks: [{
        type: "thinking",
        thinking: "summary",
        signature: "opaque",
      }],
    });
  });

  it("preserves provider HTTP status for normalized upstream errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response('{"type":"error"}', { status: 529 }),
    ));
    await expect(anthropicAdapter.complete({
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
      turns: [{ role: "user", text: "hello" }],
      tools: [],
    })).rejects.toMatchObject({ status: 529 });
  });
});
