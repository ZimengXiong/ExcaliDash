import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearAiDiscoveryCacheForTests,
  discoverProviderModels,
  getProviderDefinition,
  openCodeGoProtocolForModel,
  testProviderConnection,
} from "./providerCatalog";

afterEach(() => {
  clearAiDiscoveryCacheForTests();
  vi.unstubAllGlobals();
});

describe("AI provider catalog", () => {
  it("owns canonical defaults for known providers", () => {
    expect(getProviderDefinition("openai")).toMatchObject({
      baseUrl: "https://api.openai.com/v1",
      protocol: "openai-chat-completions",
    });
    expect(getProviderDefinition("opencode_go")).toMatchObject({
      baseUrl: "https://opencode.ai/zen/go/v1",
      protocol: "mixed",
    });
  });

  it("routes OpenCode Go models through their documented protocol", () => {
    expect(openCodeGoProtocolForModel("minimax-m3")).toBe("anthropic-messages");
    expect(openCodeGoProtocolForModel("qwen3.7-plus")).toBe("anthropic-messages");
    expect(openCodeGoProtocolForModel("kimi-k3")).toBe("openai-chat-completions");
    expect(openCodeGoProtocolForModel("future-unreviewed-model")).toBeNull();
  });

  it("discovers and filters OpenAI chat models", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { id: "gpt-5.4" },
        { id: "text-embedding-3-large" },
        { id: "whisper-1" },
      ],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await discoverProviderModels({
      provider: "openai",
      apiKey: "sk-test",
    });

    expect(result.source).toBe("live");
    expect(result.models.map((model) => model.id)).toEqual(["gpt-5.4"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({
        headers: { authorization: "Bearer sk-test" },
      }),
    );
  });

  it("uses credential-scoped cache and explicit refresh bypasses it", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: "model-a" }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: "model-b" }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      provider: "custom" as const,
      apiKey: "secret",
      baseUrl: "https://gateway.example/v1",
    };

    expect((await discoverProviderModels(input)).source).toBe("live");
    const cached = await discoverProviderModels(input);
    expect(cached.source).toBe("cache");
    expect(cached.models[0].id).toBe("model-a");
    const refreshed = await discoverProviderModels({ ...input, refresh: true });
    expect(refreshed.models[0].id).toBe("model-b");
    const stale = await discoverProviderModels({ ...input, refresh: true });
    expect(stale).toMatchObject({ source: "cache" });
    expect(stale.models[0].id).toBe("model-b");
    expect(stale.warning).toMatch(/last successful catalog/i);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("falls back without erasing a configured model", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("unavailable", { status: 503 }),
    ));
    const result = await discoverProviderModels({
      provider: "custom",
      apiKey: "secret",
      baseUrl: "https://gateway.example/v1",
      selectedModel: "private-model",
    });

    expect(result.source).toBe("configured");
    expect(result.models[0]).toMatchObject({ id: "private-model" });
    expect(result.warning).toMatch(/temporarily unavailable/i);
  });

  it("returns structured authentication and selected-model failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("unauthorized", { status: 401 }),
    ));
    await expect(testProviderConnection({
      provider: "anthropic",
      apiKey: "bad-key",
      selectedModel: "claude-test",
    })).resolves.toMatchObject({
      ok: false,
      code: "authentication_failure",
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "gpt-other" }] }), { status: 200 }),
    ));
    await expect(testProviderConnection({
      provider: "openai",
      apiKey: "sk-test",
      selectedModel: "gpt-missing",
    })).resolves.toMatchObject({
      ok: false,
      code: "unsupported_model",
    });
  });

  it("labels OpenCode Go's public catalog credential caveat", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "kimi-k3" }] }), { status: 200 }),
    ));
    const result = await testProviderConnection({
      provider: "opencode_go",
      apiKey: "oc-test",
      selectedModel: "kimi-k3",
    });
    expect(result).toMatchObject({ ok: true, code: "success" });
    expect(result.guidance).toMatch(/key itself is verified only/i);
  });
});
