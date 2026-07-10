import { describe, expect, it } from "vitest";
import { resolveAiSettings, toAiStatus } from "./settings";
import { encryptSecret } from "./crypto";

// The test env sets no AI_* vars, so config.ai.provider is "disabled" and
// config.ai.apiKey is null — this suite exercises the DB-override path.

describe("ai/settings resolveAiSettings", () => {
  it("is disabled and unavailable with no DB row and no env config", () => {
    const settings = resolveAiSettings(null);
    expect(settings.provider).toBe("disabled");
    expect(settings.available).toBe(false);
    expect(settings.keySource).toBeNull();
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

  it("stays disabled/unavailable when a key is present but provider is disabled", () => {
    const settings = resolveAiSettings({
      aiProvider: "disabled",
      aiApiKeyEncrypted: encryptSecret("sk-x"),
    });
    expect(settings.available).toBe(false);
  });

  it("toAiStatus never leaks the key", () => {
    const settings = resolveAiSettings({
      aiProvider: "anthropic",
      aiApiKeyEncrypted: encryptSecret("sk-secret"),
    });
    const status = toAiStatus(settings);
    expect(status).toEqual({
      available: true,
      provider: "anthropic",
      model: "claude-opus-4-8",
      keyConfigured: true,
      keySource: "db",
    });
    expect(JSON.stringify(status)).not.toContain("sk-secret");
  });
});
