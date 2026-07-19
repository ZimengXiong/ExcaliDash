import { config } from "../../config";
import type { ChatGptAuth } from "./store";

export type ChatGptModel = {
  id: string;
  label: string;
  reasoningEfforts: string[];
};

type RawModel = {
  slug?: unknown;
  display_name?: unknown;
  supported_in_api?: unknown;
  visibility?: unknown;
  supported_reasoning_levels?: unknown;
};

const CHATGPT_MODEL_CACHE_TTL_MS = 5 * 60 * 1000;
const chatGptModelCache = new Map<
  string,
  { expiresAt: number; models: ChatGptModel[] }
>();

export const reasoningEffortsForChatGptModel = (id: string): string[] =>
  id.startsWith("gpt-5.6-")
    ? ["none", "low", "medium", "high", "xhigh", "max"]
    : /^gpt-5\.[45](?:-|$)/.test(id)
      ? ["none", "low", "medium", "high", "xhigh"]
      : ["low", "medium", "high", "xhigh"];

const fallbackModels = (): ChatGptModel[] =>
  config.ai.chatgpt.models.map((id) => ({
    id,
    label: id,
    reasoningEfforts: reasoningEffortsForChatGptModel(id),
  }));

export const mergeChatGptModels = (
  configured: ChatGptModel[],
  live: ChatGptModel[],
): ChatGptModel[] => {
  const configuredById = new Map(configured.map((model) => [model.id, model]));
  return live.map((model) => {
    const registered = configuredById.get(model.id);
    return {
      ...model,
      reasoningEfforts:
        model.reasoningEfforts.length > 0
          ? model.reasoningEfforts
          : (registered?.reasoningEfforts ?? []),
    };
  });
};

/** Reads the catalog exposed to this specific ChatGPT subscription. */
export const fetchChatGptModels = async (auth: ChatGptAuth): Promise<ChatGptModel[]> => {
  const c = config.ai.chatgpt;
  const cacheKey = `${auth.accountId}:${c.codexBaseUrl}:${c.clientVersion}`;
  const cached = chatGptModelCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.models;
  const url = new URL(`${c.codexBaseUrl}/models`);
  url.searchParams.set("client_version", c.clientVersion);
  try {
    const response = await fetch(url.toString(), {
      headers: {
        authorization: `Bearer ${auth.accessToken}`,
        "chatgpt-account-id": auth.accountId,
        originator: c.originator,
      },
    });
    if (!response.ok) return cached?.models ?? fallbackModels();
    const payload = (await response.json()) as { models?: unknown };
    if (!Array.isArray(payload.models)) return cached?.models ?? fallbackModels();
    const models: ChatGptModel[] = [];
    for (const raw of payload.models as RawModel[]) {
      if (raw.supported_in_api !== true || raw.visibility !== "list" || typeof raw.slug !== "string") continue;
      const reasoningEfforts = Array.isArray(raw.supported_reasoning_levels)
        ? raw.supported_reasoning_levels
            .map((level) => {
              if (typeof level !== "object" || level === null) return null;
              const effort = (level as { effort?: unknown }).effort;
              return typeof effort === "string" ? effort : null;
            })
            .filter((effort): effort is string => effort !== null)
        : [];
      models.push({
        id: raw.slug,
        label: typeof raw.display_name === "string" ? raw.display_name : raw.slug,
        reasoningEfforts,
      });
    }
    // A successful per-account catalog is authoritative. Re-introducing
    // configured models that the account did not receive makes the UI offer
    // slugs the backend will reject. Static models remain a network/error-only
    // fallback.
    const merged = mergeChatGptModels(fallbackModels(), models);
    if (merged.length === 0) return cached?.models ?? fallbackModels();
    chatGptModelCache.set(cacheKey, {
      expiresAt: Date.now() + CHATGPT_MODEL_CACHE_TTL_MS,
      models: merged,
    });
    return merged;
  } catch {
    return cached?.models ?? fallbackModels();
  }
};

export const clearChatGptModelCacheForTests = (): void => {
  chatGptModelCache.clear();
};
