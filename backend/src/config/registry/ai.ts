import type { EnvVarSpec } from "./types";

export const aiEnv: readonly EnvVarSpec[] = [
  {
    name: "KIMI_API_KEY",
    group: "AI",
    kind: "string",
    secret: true,
    doc: "Moonshot API key used by the board AI assistant; keep it server-side.",
  },
  {
    name: "KIMI_BASE_URL",
    group: "AI",
    kind: "string",
    default: "https://api.moonshot.ai/v1",
    doc: "OpenAI-compatible Moonshot API base URL.",
  },
  {
    name: "KIMI_MODEL",
    group: "AI",
    kind: "string",
    default: "kimi-k3.1-pro",
    doc: "Kimi model used for board conversations and edits.",
  },
  {
    name: "KIMI_REASONING_EFFORT",
    group: "AI",
    kind: "enum",
    values: ["low", "high", "max"],
    default: "high",
    doc: "Reasoning effort sent to Kimi for each board AI request.",
  },
  {
    name: "KIMI_TIMEOUT_MS",
    group: "AI",
    kind: "number",
    default: "180000",
    doc: "Maximum time in milliseconds to wait for a Kimi response.",
  },
];
