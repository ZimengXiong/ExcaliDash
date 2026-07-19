import { describe, expect, it } from "vitest";
import {
  encodeStoredAiProfiles,
  resolveAiRegistry,
  resolveAiSettings,
  toAiStatus,
} from "./settings";
import { encryptSecret } from "./crypto";

// The test env sets no AI_* vars, so config.ai.provider is "disabled" and
// config.ai.apiKey is null — this suite exercises the DB-override path.

describe("ai/settings resolveAiSettings", () => {
  it("offers the built-in ChatGPT subscription with no registry configuration", () => {
    const settings = resolveAiSettings(null);
    expect(settings.provider).toBe("chatgpt");
    expect(settings.available).toBe(true);
    expect(settings.keySource).toBeNull();
    expect(settings.baseUrl).toBeNull();
    expect(settings.models.length).toBeGreaterThan(0);
    expect(settings.models[0].reasoningEfforts.length).toBeGreaterThan(0);
  });

  it("becomes available with a DB provider + encrypted key, using provider defaults", () => {
    const settings = resolveAiSettings({
      aiProvider: "anthropic",
      aiApiKeyEncrypted: encryptSecret("sk-test"),
    });
    expect(settings.provider).toBe("anthropic");
    expect(settings.apiKey).toBe("sk-test");
    expect(settings.keySource).toBe("db");
    expect(settings.baseUrl).toBe("https://api.anthropic.com/v1");
    expect(settings.model).toBe("claude-opus-4-8");
    expect(settings.available).toBe(true);
  });

  it("honors DB baseUrl and model overrides", () => {
    const settings = resolveAiSettings({
      aiProvider: "openai",
      aiBaseUrl: "https://gateway.example.com/v1",
      aiModel: "gpt-4o-mini",
      aiApiKeyEncrypted: encryptSecret("sk-openai"),
    });
    expect(settings.baseUrl).toBe("https://gateway.example.com/v1");
    expect(settings.model).toBe("gpt-4o-mini");
    expect(settings.available).toBe(true);
  });

  it("custom provider is unavailable without an explicit base URL", () => {
    const settings = resolveAiSettings({
      aiProvider: "custom",
      aiModel: "local-model",
      aiApiKeyEncrypted: encryptSecret("sk-x"),
    });
    expect(settings.baseUrl).toBeNull();
    expect(settings.available).toBe(false);
  });

  it("applies first-class OpenCode Go defaults without leaking its key", () => {
    const aiProviderProfiles = encodeStoredAiProfiles([{
      id: "go",
      label: "OpenCode Go",
      provider: "opencode_go",
      enabled: true,
      baseUrl: null,
      models: [],
      apiKey: "oc-secret",
    }]);
    const settings = resolveAiSettings({ aiProviderProfiles }, "go");
    expect(settings).toMatchObject({
      provider: "opencode_go",
      baseUrl: "https://opencode.ai/zen/go/v1",
      model: "kimi-k3",
      available: true,
    });
    expect(JSON.stringify(toAiStatus(settings))).not.toContain("oc-secret");
  });

  it("keeps disabled provider profiles unavailable", () => {
    const profiles = encodeStoredAiProfiles([{
      id: "off",
      label: "Off",
      provider: "openai",
      enabled: false,
      baseUrl: null,
      models: [{ id: "gpt-5.4", label: "GPT-5.4", reasoningEfforts: [] }],
      apiKey: "sk-disabled",
    }]);
    const registry = resolveAiRegistry({
      aiProviderProfiles: profiles,
      aiDefaultProviderId: "off",
    });
    expect(registry.providers[0]).toMatchObject({
      enabled: false,
      available: false,
    });
    expect(toAiStatus(registry).available).toBe(false);
  });

  it("ignores a legacy API key when only the built-in ChatGPT provider is enabled", () => {
    const settings = resolveAiSettings({
      aiProvider: "disabled",
      aiApiKeyEncrypted: encryptSecret("sk-x"),
    });
    expect(settings.provider).toBe("chatgpt");
    expect(settings.apiKey).toBeNull();
    expect(settings.available).toBe(true);
  });

  it("makes the chatgpt provider available without an API key (per-user auth)", () => {
    const settings = resolveAiSettings({ aiProvider: "chatgpt" });
    expect(settings.provider).toBe("chatgpt");
    expect(settings.available).toBe(true);
    expect(settings.chatgptEnabled).toBe(true);
    // No env/DB key needed; a Codex default model is chosen.
    expect(settings.apiKey).toBeNull();
    expect(settings.model).toBeTruthy();
  });

  it("ignores the legacy DB ChatGPT switch in favor of deployment config", () => {
    const settings = resolveAiSettings({
      aiProvider: "chatgpt",
      aiChatgptEnabled: false,
    });
    expect(settings.available).toBe(true);
    expect(settings.chatgptEnabled).toBe(true);
  });

  it("toAiStatus never leaks the key", () => {
    const settings = resolveAiSettings({
      aiProvider: "anthropic",
      aiApiKeyEncrypted: encryptSecret("sk-secret"),
    });
    const status = toAiStatus(settings);
    expect(status).toMatchObject({
      available: true,
      provider: "anthropic",
      model: "claude-opus-4-8",
      keyConfigured: true,
      keySource: "db",
      chatgptEnabled: true,
    });
    expect(JSON.stringify(status)).not.toContain("sk-secret");
  });

  it("resolves multiple named providers with an explicit default", () => {
    const aiProviderProfiles = encodeStoredAiProfiles([
      {
        id: "fast",
        label: "Fast model",
        provider: "openai",
        enabled: true,
        baseUrl: null,
        models: [{ id: "gpt-fast", label: "GPT Fast", reasoningEfforts: ["low"] }],
        apiKey: "sk-fast",
      },
      {
        id: "deep",
        label: "Deep model",
        provider: "custom",
        enabled: true,
        baseUrl: "https://gemini.example/v1beta/openai",
        models: [{ id: "gemini-deep", label: "Gemini Deep", reasoningEfforts: ["medium", "high"] }],
        apiKey: "sk-deep",
      },
    ]);
    const registry = resolveAiRegistry({ aiProviderProfiles, aiDefaultProviderId: "deep" });

    expect(registry.defaultProviderId).toBe("deep");
    expect(registry.providers.map((profile) => profile.id)).toEqual(["fast", "deep"]);
    expect(resolveAiSettings({ aiProviderProfiles, aiDefaultProviderId: "deep" }).model)
      .toBe("gemini-deep");
    expect(registry.providers.every((profile) => profile.available)).toBe(true);
  });

  it("preserves existing per-profile keys when an admin edits non-secret fields", () => {
    const original = encodeStoredAiProfiles([{
      id: "openai",
      label: "OpenAI",
      provider: "openai",
      enabled: true,
      baseUrl: null,
      models: [{ id: "gpt-a", label: "GPT A", reasoningEfforts: [] }],
      apiKey: "sk-preserved",
    }]);
    const updated = encodeStoredAiProfiles([{
      id: "openai",
      label: "Renamed",
      provider: "openai",
      enabled: true,
      baseUrl: null,
      models: [{ id: "gpt-b", label: "GPT B", reasoningEfforts: [] }],
    }], original);

    expect(resolveAiSettings({ aiProviderProfiles: updated }, "openai").apiKey)
      .toBe("sk-preserved");
  });
});
