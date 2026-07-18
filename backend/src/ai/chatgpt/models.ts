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

export const reasoningEffortsForChatGptModel = (id: string): string[] =>
  id.startsWith("gpt-5.6-")
    ? ["none", "low", "medium", "high", "xhigh", "max"]
    : id === "gpt-5.5" || id === "gpt-5.4"
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
  const liveById = new Map(live.map((model) => [model.id, model]));
  const merged = configured.map((model) => {
    const liveModel = liveById.get(model.id);
    if (!liveModel) return model;
    return {
      ...liveModel,
      reasoningEfforts:
        liveModel.reasoningEfforts.length > 0
          ? liveModel.reasoningEfforts
          : model.reasoningEfforts,
    };
  });
  const configuredIds = new Set(configured.map((model) => model.id));
  return [...merged, ...live.filter((model) => !configuredIds.has(model.id))];
};

/** Reads the catalog exposed to this specific ChatGPT subscription. */
export const fetchChatGptModels = async (auth: ChatGptAuth): Promise<ChatGptModel[]> => {
  const c = config.ai.chatgpt;
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
    if (!response.ok) return fallbackModels();
    const payload = (await response.json()) as { models?: unknown };
    if (!Array.isArray(payload.models)) return fallbackModels();
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
    return mergeChatGptModels(fallbackModels(), models);
  } catch {
    return fallbackModels();
  }
};
