import { createHash } from "node:crypto";
import type { AiModelOption, AiProviderKind } from "./settings";
import {
  FALLBACK_MODELS,
  getProviderDefinition,
  isSupportedOpenCodeGoModel,
} from "./providerDefinitions";
export {
  getProviderDefinition,
  getProviderDefinitions,
  openCodeGoProtocolForModel,
} from "./providerDefinitions";
export type {
  AiProviderDefinition,
  AiProviderProtocol,
} from "./providerDefinitions";

export type AiDiscoveryInput = {
  provider: AiProviderKind;
  apiKey: string | null;
  baseUrl?: string | null;
  selectedModel?: string | null;
  refresh?: boolean;
};

export type AiDiscoveryResult = {
  models: AiModelOption[];
  source: "live" | "cache" | "fallback" | "configured";
  warning?: string;
  fetchedAt: string;
};

export type AiConnectionCode =
  | "success"
  | "authentication_failure"
  | "unreachable"
  | "unsupported_model"
  | "rate_limited"
  | "malformed_response"
  | "configuration_error";

export type AiConnectionTestResult = {
  ok: boolean;
  code: AiConnectionCode;
  message: string;
  guidance?: string;
  models?: AiModelOption[];
};


const CACHE_TTL_MS = 10 * 60 * 1000;
const discoveryCache = new Map<
  string,
  { expiresAt: number; result: AiDiscoveryResult }
>();

const trimBaseUrl = (value: string): string => value.replace(/\/+$/, "");

const validateBaseUrl = (value: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("CONFIGURATION_ERROR");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.hash
  ) {
    throw new Error("CONFIGURATION_ERROR");
  }
  return trimBaseUrl(parsed.toString());
};

const cacheKeyFor = (input: AiDiscoveryInput, baseUrl: string): string =>
  [
    input.provider,
    baseUrl,
    createHash("sha256").update(input.apiKey ?? "").digest("hex").slice(0, 16),
  ].join(":");

const modelOption = (
  id: string,
  label?: string | null,
  reasoningEfforts: string[] = [],
): AiModelOption => ({ id, label: label?.trim() || id, reasoningEfforts });

const isChatCapableOpenAiModel = (id: string): boolean => {
  const lower = id.toLowerCase();
  return ![
    "embedding",
    "dall-e",
    "image",
    "audio",
    "whisper",
    "tts",
    "transcri",
    "moderation",
    "realtime",
    "search-preview",
  ].some((token) => lower.includes(token));
};

const mergeSelectedModel = (
  models: AiModelOption[],
  selectedModel?: string | null,
): AiModelOption[] => {
  const selected = selectedModel?.trim();
  if (!selected || models.some((model) => model.id === selected)) return models;
  return [modelOption(selected, `${selected} (configured)`), ...models];
};

const parseJson = async (response: Response): Promise<unknown> => {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > 2_000_000) throw new Error("MALFORMED_RESPONSE");
  try {
    const text = await response.text();
    if (text.length > 2_000_000) throw new Error("MALFORMED_RESPONSE");
    return JSON.parse(text);
  } catch {
    throw new Error("MALFORMED_RESPONSE");
  }
};

const fetchOpenAiModels = async (
  baseUrl: string,
  apiKey: string | null,
): Promise<AiModelOption[]> => {
  const response = await fetch(`${trimBaseUrl(baseUrl)}/models`, {
    headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw Object.assign(new Error("HTTP_ERROR"), { status: response.status });
  const data = await parseJson(response) as { data?: Array<{ id?: unknown }> };
  if (!Array.isArray(data.data)) throw new Error("MALFORMED_RESPONSE");
  return data.data
    .flatMap((item) => typeof item?.id === "string" ? [item.id] : [])
    .filter(isChatCapableOpenAiModel)
    .map((id) => modelOption(id));
};

const fetchAnthropicModels = async (
  baseUrl: string,
  apiKey: string | null,
): Promise<AiModelOption[]> => {
  const response = await fetch(`${trimBaseUrl(baseUrl)}/models?limit=100`, {
    headers: {
      ...(apiKey ? { "x-api-key": apiKey } : {}),
      "anthropic-version": "2023-06-01",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw Object.assign(new Error("HTTP_ERROR"), { status: response.status });
  const data = await parseJson(response) as {
    data?: Array<{ id?: unknown; display_name?: unknown }>;
  };
  if (!Array.isArray(data.data)) throw new Error("MALFORMED_RESPONSE");
  return data.data.flatMap((item) =>
    typeof item?.id === "string"
      ? [modelOption(item.id, typeof item.display_name === "string" ? item.display_name : null)]
      : []
  );
};

const fetchGeminiModels = async (
  apiKey: string | null,
): Promise<AiModelOption[]> => {
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
    {
      headers: apiKey ? { "x-goog-api-key": apiKey } : {},
      signal: AbortSignal.timeout(12_000),
    },
  );
  if (!response.ok) throw Object.assign(new Error("HTTP_ERROR"), { status: response.status });
  const data = await parseJson(response) as {
    models?: Array<{
      name?: unknown;
      displayName?: unknown;
      supportedGenerationMethods?: unknown;
      supportedActions?: unknown;
    }>;
  };
  if (!Array.isArray(data.models)) throw new Error("MALFORMED_RESPONSE");
  return data.models.flatMap((item) => {
    const methods = Array.isArray(item.supportedGenerationMethods)
      ? item.supportedGenerationMethods
      : Array.isArray(item.supportedActions) ? item.supportedActions : [];
    if (!methods.includes("generateContent") || typeof item.name !== "string") return [];
    const id = item.name.replace(/^models\//, "");
    return [modelOption(
      id,
      typeof item.displayName === "string" ? item.displayName : null,
      ["low", "medium", "high"],
    )];
  });
};

const fetchLiveModels = async (
  input: AiDiscoveryInput,
  baseUrl: string,
): Promise<AiModelOption[]> => {
  if (input.provider === "anthropic") {
    return fetchAnthropicModels(baseUrl, input.apiKey);
  }
  if (input.provider === "gemini" &&
    /generativelanguage\.googleapis\.com/i.test(baseUrl)) {
    return fetchGeminiModels(input.apiKey);
  }
  const models = await fetchOpenAiModels(baseUrl, input.apiKey);
  return input.provider === "opencode_go"
    ? models.filter((model) => isSupportedOpenCodeGoModel(model.id))
    : models;
};

const fallbackResult = (
  input: AiDiscoveryInput,
  warning: string,
): AiDiscoveryResult => ({
  models: mergeSelectedModel(FALLBACK_MODELS[input.provider], input.selectedModel),
  source: input.selectedModel && FALLBACK_MODELS[input.provider].length === 0
    ? "configured"
    : "fallback",
  warning,
  fetchedAt: new Date().toISOString(),
});

export const discoverProviderModels = async (
  input: AiDiscoveryInput,
): Promise<AiDiscoveryResult> => {
  if (input.provider === "chatgpt") {
    return fallbackResult(input, "ChatGPT subscription models are discovered per connected user.");
  }
  const definition = getProviderDefinition(input.provider);
  const baseUrl = input.baseUrl?.trim() || definition.baseUrl;
  if (!baseUrl) {
    return fallbackResult(input, "Enter a base URL to discover models.");
  }
  try {
    validateBaseUrl(baseUrl);
  } catch {
    return fallbackResult(input, "The base URL is not a valid URL.");
  }
  const key = cacheKeyFor(input, baseUrl);
  const cached = discoveryCache.get(key);
  if (!input.refresh && cached && cached.expiresAt > Date.now()) {
    return {
      ...cached.result,
      source: "cache",
      models: mergeSelectedModel(cached.result.models, input.selectedModel),
    };
  }
  try {
    const models = await fetchLiveModels(input, baseUrl);
    if (models.length === 0) {
      return fallbackResult(input, "The provider returned no chat-capable models.");
    }
    const result: AiDiscoveryResult = {
      models: mergeSelectedModel(models, input.selectedModel),
      source: "live",
      fetchedAt: new Date().toISOString(),
    };
    discoveryCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, result });
    return result;
  } catch (error) {
    const status = (error as { status?: number }).status;
    const warning = status === 401 || status === 403
      ? "Authentication failed while listing models."
      : status === 429
        ? "The provider rate-limited model discovery."
        : (error as Error).message === "MALFORMED_RESPONSE"
          ? "The provider returned an invalid model catalog."
          : "The live model catalog is temporarily unavailable.";
    if (cached) {
      return {
        ...cached.result,
        source: "cache",
        warning: `${warning} Showing the last successful catalog.`,
        models: mergeSelectedModel(cached.result.models, input.selectedModel),
      };
    }
    return fallbackResult(input, warning);
  }
};

export const testProviderConnection = async (
  input: AiDiscoveryInput,
): Promise<AiConnectionTestResult> => {
  const definition = getProviderDefinition(input.provider);
  if (input.provider === "chatgpt") {
    return {
      ok: true,
      code: "success",
      message: "ChatGPT subscription support is enabled.",
      guidance: "Each user tests their connection by connecting ChatGPT from the canvas.",
    };
  }
  if (!input.apiKey) {
    return {
      ok: false,
      code: "configuration_error",
      message: "Enter an API key before testing.",
    };
  }
  const baseUrl = input.baseUrl?.trim() || definition.baseUrl;
  if (!baseUrl) {
    return {
      ok: false,
      code: "configuration_error",
      message: "Enter a base URL before testing.",
    };
  }
  try {
    validateBaseUrl(baseUrl);
  } catch {
    return {
      ok: false,
      code: "configuration_error",
      message: "The base URL must be a valid HTTP or HTTPS URL without embedded credentials.",
    };
  }
  try {
    const models = await fetchLiveModels(input, baseUrl);
    if (!Array.isArray(models)) {
      return { ok: false, code: "malformed_response", message: "The provider returned an invalid model catalog." };
    }
    const requested = input.selectedModel?.trim();
    if (requested && !models.some((model) => model.id === requested)) {
      return {
        ok: false,
        code: "unsupported_model",
        message: `Connected, but model “${requested}” was not returned by the provider.`,
        guidance: "Refresh the model list or keep the manual ID only if the provider catalog is known to lag.",
        models,
      };
    }
    return {
      ok: true,
      code: "success",
      message: input.provider === "opencode_go"
        ? "OpenCode Go is reachable and the selected model is available."
        : "Connection successful. Credentials and model access were verified without generating content.",
      guidance: input.provider === "opencode_go"
        ? "OpenCode Go exposes its catalog publicly, so the API key itself is verified only on the first chat request."
        : undefined,
      models,
    };
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 401 || status === 403) {
      return { ok: false, code: "authentication_failure", message: "Authentication failed.", guidance: "Check that the API key is active and authorized to list models." };
    }
    if (status === 429) {
      return { ok: false, code: "rate_limited", message: "The provider rate-limited the connection test.", guidance: "Wait briefly and try again. No content was generated." };
    }
    if (status === 404) {
      return {
        ok: false,
        code: "configuration_error",
        message: "This base URL does not expose a model catalog.",
        guidance: input.provider === "custom"
          ? "Keep the manual model ID and verify that the base URL points to the API root."
          : "Restore the provider's canonical base URL or check the advanced override.",
      };
    }
    if ((error as Error).message === "MALFORMED_RESPONSE") {
      return { ok: false, code: "malformed_response", message: "The provider returned an invalid model catalog." };
    }
    return {
      ok: false,
      code: "unreachable",
      message: "Could not reach the provider.",
      guidance: error instanceof Error ? error.message : undefined,
    };
  }
};

export const clearAiDiscoveryCacheForTests = (): void => {
  discoveryCache.clear();
};
