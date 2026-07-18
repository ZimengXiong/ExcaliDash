import { config } from "../config";
import type { AiProvider } from "../config/ai";
import { decryptSecret, encryptSecret } from "./crypto";
import { reasoningEffortsForChatGptModel } from "./chatgpt/models";

export type AiProviderKind = Exclude<AiProvider, "disabled">;

export type AiModelOption = {
  id: string;
  label: string;
  reasoningEfforts: string[];
};

export type AiProviderProfileInput = {
  id: string;
  label: string;
  provider: AiProviderKind;
  enabled: boolean;
  baseUrl?: string | null;
  models: AiModelOption[];
  apiKey?: string;
  clearApiKey?: boolean;
};

export type StoredAiProviderProfile = Omit<
  AiProviderProfileInput,
  "apiKey" | "clearApiKey"
> & { apiKeyEncrypted?: string | null };

export type AiSystemConfigRow = {
  aiProvider?: string | null;
  aiBaseUrl?: string | null;
  aiModel?: string | null;
  aiApiKeyEncrypted?: string | null;
  aiChatgptEnabled?: boolean | null;
  aiProviderProfiles?: string | null;
  aiDefaultProviderId?: string | null;
};

export type ResolvedAiSettings = {
  id: string;
  label: string;
  provider: AiProvider;
  apiKey: string | null;
  baseUrl: string | null;
  model: string | null;
  models: AiModelOption[];
  maxTokensPerRequest: number;
  keySource: "env" | "db" | null;
  available: boolean;
  enabled: boolean;
  chatgptEnabled: boolean;
};

export type ResolvedAiRegistry = {
  providers: ResolvedAiSettings[];
  defaultProviderId: string | null;
  chatgptEnabled: boolean;
};

const DEFAULT_BASE_URL: Record<AiProvider, string | null> = {
  disabled: null,
  anthropic: "https://api.anthropic.com/v1",
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  custom: null,
  chatgpt: null,
};

const DEFAULT_MODEL: Record<AiProvider, string | null> = {
  disabled: null,
  anthropic: "claude-opus-4-8",
  openai: "gpt-4o",
  gemini: "gemini-2.5-pro",
  custom: null,
  chatgpt: null,
};

const trimOrNull = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const parseProvider = (value: unknown): AiProvider | null => {
  const normalized = trimOrNull(value)?.toLowerCase();
  return normalized === "disabled" ||
    normalized === "anthropic" ||
    normalized === "openai" ||
    normalized === "gemini" ||
    normalized === "custom" ||
    normalized === "chatgpt"
    ? normalized
    : null;
};

const normalizeModels = (models: unknown): AiModelOption[] => {
  if (!Array.isArray(models)) return [];
  const result: AiModelOption[] = [];
  for (const raw of models) {
    if (!raw || typeof raw !== "object") continue;
    const value = raw as Record<string, unknown>;
    const id = trimOrNull(value.id);
    if (!id) continue;
    result.push({
      id,
      label: trimOrNull(value.label) ?? id,
      reasoningEfforts: Array.isArray(value.reasoningEfforts)
        ? value.reasoningEfforts
            .map(trimOrNull)
            .filter((effort): effort is string => Boolean(effort))
        : [],
    });
  }
  return result;
};

export const readStoredAiProfiles = (
  raw: string | null | undefined,
): StoredAiProviderProfile[] | null => {
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.flatMap((item): StoredAiProviderProfile[] => {
      if (!item || typeof item !== "object") return [];
      const value = item as Record<string, unknown>;
      const id = trimOrNull(value.id);
      const provider = parseProvider(value.provider);
      if (!id || !provider || provider === "disabled") return [];
      return [{
        id,
        label: trimOrNull(value.label) ?? id,
        provider,
        enabled: value.enabled !== false,
        baseUrl: trimOrNull(value.baseUrl),
        models: normalizeModels(value.models),
        apiKeyEncrypted: trimOrNull(value.apiKeyEncrypted),
      }];
    });
  } catch {
    return null;
  }
};

export const encodeStoredAiProfiles = (
  inputs: AiProviderProfileInput[],
  currentRaw?: string | null,
  legacyKeyEncrypted?: string | null,
): string => {
  const current = new Map(
    (readStoredAiProfiles(currentRaw) ?? []).map((profile) => [profile.id, profile]),
  );
  return JSON.stringify(inputs.map((input) => {
    const previous = current.get(input.id);
    const inheritedLegacyKey = input.id === "legacy" ? legacyKeyEncrypted : null;
    const apiKeyEncrypted = input.clearApiKey
      ? null
      : input.apiKey !== undefined
        ? (input.apiKey ? encryptSecret(input.apiKey) : null)
        : previous?.apiKeyEncrypted ?? inheritedLegacyKey ?? null;
    return {
      id: input.id,
      label: input.label,
      provider: input.provider,
      enabled: input.enabled,
      baseUrl: input.provider === "chatgpt" ? null : input.baseUrl ?? null,
      models: input.provider === "chatgpt" ? [] : input.models,
      apiKeyEncrypted,
    } satisfies StoredAiProviderProfile;
  }));
};

const resolveProfile = (
  profile: StoredAiProviderProfile,
  chatgptEnabled: boolean,
): ResolvedAiSettings => {
  const envKey = profile.id === "legacy" ? config.ai.apiKey : null;
  const dbKey = decryptSecret(profile.apiKeyEncrypted);
  const apiKey = envKey ?? dbKey;
  const keySource = envKey ? "env" as const : dbKey ? "db" as const : null;
  const defaultModel = profile.provider === "chatgpt"
    ? config.ai.chatgpt.models[0] ?? null
    : DEFAULT_MODEL[profile.provider];
  const models = profile.provider === "chatgpt"
    ? config.ai.chatgpt.models.map((id) => ({
        id,
        label: id,
        reasoningEfforts: reasoningEffortsForChatGptModel(id),
      }))
    : profile.models.length > 0
      ? profile.models
      : defaultModel
        ? [{ id: defaultModel, label: defaultModel, reasoningEfforts: [] }]
        : [];
  const baseUrl = profile.provider === "chatgpt"
    ? null
    : profile.baseUrl ?? DEFAULT_BASE_URL[profile.provider];
  const enabled = profile.enabled && (profile.provider !== "chatgpt" || chatgptEnabled);
  const available = enabled && (profile.provider === "chatgpt"
    ? true
    : Boolean(apiKey) && Boolean(baseUrl) && models.length > 0);
  return {
    id: profile.id,
    label: profile.label,
    provider: profile.provider,
    apiKey,
    baseUrl,
    model: models[0]?.id ?? null,
    models,
    maxTokensPerRequest: config.ai.maxTokensPerRequest,
    keySource,
    available,
    enabled,
    chatgptEnabled,
  };
};

const legacyProfile = (row?: AiSystemConfigRow | null): StoredAiProviderProfile => {
  const provider = parseProvider(row?.aiProvider) ?? config.ai.provider;
  const model = trimOrNull(row?.aiModel) ?? config.ai.model ??
    (provider === "chatgpt" ? config.ai.chatgpt.models[0] ?? null : DEFAULT_MODEL[provider]);
  return {
    id: "legacy",
    label: provider === "chatgpt" ? "ChatGPT" : provider === "disabled" ? "Disabled" : provider,
    provider: provider === "disabled" ? "custom" : provider,
    enabled: provider !== "disabled",
    baseUrl: trimOrNull(row?.aiBaseUrl) ?? config.ai.baseUrl,
    models: model ? [{ id: model, label: model, reasoningEfforts: [] }] : [],
    apiKeyEncrypted: row?.aiApiKeyEncrypted ?? null,
  };
};

const builtInChatGptProfile = (): StoredAiProviderProfile => ({
  id: "chatgpt-subscription",
  label: "ChatGPT subscription",
  provider: "chatgpt",
  enabled: true,
  baseUrl: null,
  models: [],
  apiKeyEncrypted: null,
});

const disabledProfile = (chatgptEnabled: boolean): ResolvedAiSettings => ({
  id: "legacy",
  label: "Disabled",
  provider: "disabled",
  apiKey: null,
  baseUrl: null,
  model: null,
  models: [],
  maxTokensPerRequest: config.ai.maxTokensPerRequest,
  keySource: null,
  available: false,
  enabled: false,
  chatgptEnabled,
});

export const resolveAiRegistry = (
  row?: AiSystemConfigRow | null,
): ResolvedAiRegistry => {
  const chatgptEnabled = config.ai.chatgpt.enabled;
  const stored = readStoredAiProfiles(row?.aiProviderProfiles);
  const legacyProvider = parseProvider(row?.aiProvider) ?? config.ai.provider;
  if (stored === null && legacyProvider === "disabled") {
    if (chatgptEnabled) {
      const provider = resolveProfile(builtInChatGptProfile(), chatgptEnabled);
      return {
        providers: [provider],
        defaultProviderId: provider.id,
        chatgptEnabled,
      };
    }
    return { providers: [disabledProfile(chatgptEnabled)], defaultProviderId: "legacy", chatgptEnabled };
  }
  const profiles = stored ?? [legacyProfile(row)];
  const providers = profiles.map((profile) => resolveProfile(profile, chatgptEnabled));
  const requestedDefault = trimOrNull(row?.aiDefaultProviderId);
  const defaultProviderId = providers.some((profile) => profile.id === requestedDefault)
    ? requestedDefault
    : providers.find((profile) => profile.available)?.id ?? providers[0]?.id ?? null;
  return { providers, defaultProviderId, chatgptEnabled };
};

export const resolveAiSettings = (
  row?: AiSystemConfigRow | null,
  providerId?: string | null,
): ResolvedAiSettings => {
  const registry = resolveAiRegistry(row);
  const selectedId = trimOrNull(providerId) ?? registry.defaultProviderId;
  return registry.providers.find((profile) => profile.id === selectedId) ??
    { ...disabledProfile(registry.chatgptEnabled), id: selectedId ?? "disabled" };
};

export type AiStatus = {
  available: boolean;
  provider: AiProvider;
  model: string | null;
  keyConfigured: boolean;
  keySource: "env" | "db" | null;
  chatgptEnabled: boolean;
  defaultProviderId: string | null;
  providers: Array<{
    id: string;
    label: string;
    provider: AiProvider;
    available: boolean;
    enabled: boolean;
    baseUrl: string | null;
    models: AiModelOption[];
    keyConfigured: boolean;
    keySource: "env" | "db" | null;
  }>;
};

export const toAiStatus = (
  input: ResolvedAiRegistry | ResolvedAiSettings,
): AiStatus => {
  const registry: ResolvedAiRegistry = "providers" in input
    ? input
    : {
        providers: [input],
        defaultProviderId: input.id,
        chatgptEnabled: input.chatgptEnabled,
      };
  const selected = registry.providers.find((profile) => profile.id === registry.defaultProviderId);
  return {
    available: registry.providers.some((profile) => profile.available),
    provider: selected?.provider ?? "disabled",
    model: selected?.model ?? null,
    keyConfigured: Boolean(selected?.apiKey),
    keySource: selected?.keySource ?? null,
    chatgptEnabled: registry.chatgptEnabled,
    defaultProviderId: registry.defaultProviderId,
    providers: registry.providers.map((profile) => ({
      id: profile.id,
      label: profile.label,
      provider: profile.provider,
      available: profile.available,
      enabled: profile.enabled,
      baseUrl: profile.baseUrl,
      models: profile.models,
      keyConfigured: Boolean(profile.apiKey),
      keySource: profile.keySource,
    })),
  };
};
