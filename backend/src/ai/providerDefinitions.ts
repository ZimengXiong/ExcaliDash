import type { AiModelOption, AiProviderKind } from "./settings";

export type AiProviderProtocol =
  | "openai-chat-completions"
  | "anthropic-messages"
  | "mixed"
  | "chatgpt-subscription";

export type AiProviderDefinition = {
  id: AiProviderKind;
  label: string;
  baseUrl: string | null;
  defaultModel: string | null;
  protocol: AiProviderProtocol;
  discovery: "live" | "fallback" | "subscription";
  help: string;
};

const OPEN_CODE_GO_ANTHROPIC_MODELS = new Set([
  "minimax-m3",
  "minimax-m2.7",
  "minimax-m2.5",
  "qwen3.7-max",
  "qwen3.7-plus",
  "qwen3.6-plus",
]);

const OPEN_CODE_GO_OPENAI_MODELS = new Set([
  "grok-4.5",
  "glm-5.2",
  "glm-5.1",
  "kimi-k3",
  "kimi-k2.7-code",
  "kimi-k2.6",
  "deepseek-v4-pro",
  "deepseek-v4-flash",
  "mimo-v2.5",
  "mimo-v2.5-pro",
]);

export const openCodeGoProtocolForModel = (
  model: string,
): Exclude<AiProviderProtocol, "mixed" | "chatgpt-subscription"> | null =>
  OPEN_CODE_GO_ANTHROPIC_MODELS.has(model)
    ? "anthropic-messages"
    : OPEN_CODE_GO_OPENAI_MODELS.has(model)
      ? "openai-chat-completions"
      : null;

export const isSupportedOpenCodeGoModel = (model: string): boolean =>
  openCodeGoProtocolForModel(model) !== null;

export const FALLBACK_MODELS: Record<AiProviderKind, AiModelOption[]> = {
  anthropic: [
    { id: "claude-opus-4-8", label: "Claude Opus 4.8", reasoningEfforts: [] },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", reasoningEfforts: [] },
  ],
  openai: [
    { id: "gpt-5.4", label: "GPT-5.4", reasoningEfforts: ["low", "medium", "high"] },
    { id: "gpt-5.4-mini", label: "GPT-5.4 mini", reasoningEfforts: ["low", "medium", "high"] },
  ],
  gemini: [
    { id: "gemini-3.5-pro", label: "Gemini 3.5 Pro", reasoningEfforts: ["low", "medium", "high"] },
    { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", reasoningEfforts: ["low", "medium", "high"] },
  ],
  opencode_go: [
    { id: "kimi-k3", label: "Kimi K3", reasoningEfforts: [] },
    { id: "glm-5.2", label: "GLM-5.2", reasoningEfforts: [] },
    { id: "minimax-m3", label: "MiniMax M3", reasoningEfforts: [] },
    { id: "mimo-v2.5-pro", label: "MiMo-V2.5-Pro", reasoningEfforts: [] },
  ],
  custom: [],
  chatgpt: [],
};

export const AI_PROVIDER_DEFINITIONS: Record<
  AiProviderKind,
  AiProviderDefinition
> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: FALLBACK_MODELS.openai[0].id,
    protocol: "openai-chat-completions",
    discovery: "live",
    help: "Uses the OpenAI API. Model listing validates the API key without generating content.",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: FALLBACK_MODELS.anthropic[0].id,
    protocol: "anthropic-messages",
    discovery: "live",
    help: "Uses the Anthropic Messages API. Model listing validates the API key without generating content.",
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: FALLBACK_MODELS.gemini[0].id,
    protocol: "openai-chat-completions",
    discovery: "live",
    help: "Uses Gemini's OpenAI-compatible chat endpoint and native model catalog.",
  },
  opencode_go: {
    id: "opencode_go",
    label: "OpenCode Go",
    baseUrl: "https://opencode.ai/zen/go/v1",
    defaultModel: FALLBACK_MODELS.opencode_go[0].id,
    protocol: "mixed",
    discovery: "live",
    help: "Uses an OpenCode Go subscription API key. Its public catalog can verify reachability and model support, but not the key without a billable generation.",
  },
  custom: {
    id: "custom",
    label: "OpenAI-compatible",
    baseUrl: null,
    defaultModel: null,
    protocol: "openai-chat-completions",
    discovery: "live",
    help: "For OpenAI-compatible servers. Model discovery depends on the server implementing GET /models.",
  },
  chatgpt: {
    id: "chatgpt",
    label: "ChatGPT subscription",
    baseUrl: null,
    defaultModel: null,
    protocol: "chatgpt-subscription",
    discovery: "subscription",
    help: "Each user connects their own ChatGPT subscription from the canvas.",
  },
};

export const getProviderDefinition = (
  provider: AiProviderKind,
): AiProviderDefinition => AI_PROVIDER_DEFINITIONS[provider];

export const getProviderDefinitions = (): AiProviderDefinition[] =>
  Object.values(AI_PROVIDER_DEFINITIONS);
