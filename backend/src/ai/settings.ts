import { config } from "../config";
import type { AiProvider } from "../config/ai";
import { decryptSecret } from "./crypto";

// Subset of SystemConfig the AI proxy reads. Kept structural so callers can pass
// the prisma row directly.
export type AiSystemConfigRow = {
  aiProvider?: string | null;
  aiBaseUrl?: string | null;
  aiModel?: string | null;
  aiApiKeyEncrypted?: string | null;
};

export type ResolvedAiSettings = {
  provider: AiProvider;
  apiKey: string | null;
  baseUrl: string | null;
  model: string | null;
  maxTokensPerRequest: number;
  /** Where the effective API key came from, for admin diagnostics. */
  keySource: "env" | "db" | null;
  /** True when the proxy is fully configured and can serve chat requests. */
  available: boolean;
};

const DEFAULT_BASE_URL: Record<AiProvider, string | null> = {
  disabled: null,
  anthropic: "https://api.anthropic.com/v1",
  openai: "https://api.openai.com/v1",
  custom: null,
};

const DEFAULT_MODEL: Record<AiProvider, string | null> = {
  disabled: null,
  anthropic: "claude-opus-4-8",
  openai: "gpt-4o",
  custom: null,
};

const trimOrNull = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseProvider = (value: string | null | undefined): AiProvider | null => {
  const normalized = trimOrNull(value)?.toLowerCase();
  if (
    normalized === "disabled" ||
    normalized === "anthropic" ||
    normalized === "openai" ||
    normalized === "custom"
  ) {
    return normalized;
  }
  return null;
};

/**
 * Resolve the effective AI configuration by layering the admin-editable DB
 * overrides on top of the env-provided defaults. Env wins for the API key
 * (secret); the DB can override the non-secret provider/baseUrl/model and can
 * supply an (encrypted) key only when no env key is set.
 */
export const resolveAiSettings = (
  row?: AiSystemConfigRow | null,
): ResolvedAiSettings => {
  const provider = parseProvider(row?.aiProvider) ?? config.ai.provider;

  const baseUrl =
    trimOrNull(row?.aiBaseUrl) ??
    config.ai.baseUrl ??
    DEFAULT_BASE_URL[provider];

  const model =
    trimOrNull(row?.aiModel) ?? config.ai.model ?? DEFAULT_MODEL[provider];

  let apiKey: string | null = null;
  let keySource: "env" | "db" | null = null;
  if (config.ai.apiKey) {
    apiKey = config.ai.apiKey;
    keySource = "env";
  } else {
    const dbKey = decryptSecret(row?.aiApiKeyEncrypted);
    if (dbKey) {
      apiKey = dbKey;
      keySource = "db";
    }
  }

  const available =
    provider !== "disabled" &&
    Boolean(apiKey) &&
    Boolean(baseUrl) &&
    Boolean(model);

  return {
    provider,
    apiKey,
    baseUrl,
    model,
    maxTokensPerRequest: config.ai.maxTokensPerRequest,
    keySource,
    available,
  };
};

/** Public status payload — never leaks the key itself. */
export type AiStatus = {
  available: boolean;
  provider: AiProvider;
  model: string | null;
  keyConfigured: boolean;
  keySource: "env" | "db" | null;
};

export const toAiStatus = (settings: ResolvedAiSettings): AiStatus => ({
  available: settings.available,
  provider: settings.provider,
  model: settings.model,
  keyConfigured: Boolean(settings.apiKey),
  keySource: settings.keySource,
});
