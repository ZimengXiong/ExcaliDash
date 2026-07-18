import type { AgentTool } from "../toolDefs";
import type { ResolvedAiSettings } from "../settings";

// Neutral conversation model the tool loop builds and each provider serializes
// to its own wire format.
export type ToolCall = {
  id: string;
  name: string;
  input: unknown;
  /**
   * Opaque provider state that must be replayed with this exact tool call.
   * Gemini's OpenAI-compatible API stores its required thought signature here.
   */
  providerMetadata?: Record<string, unknown>;
};

export type ToolResult = {
  id: string;
  content: string;
  /** A transient client-rendered canvas image; never persisted. */
  imageDataUrl?: string;
};

export type ConversationTurn =
  | {
      role: "user";
      text: string;
      /** Transient snapshot attached only to the current request. */
      imageDataUrl?: string;
      canvasState?: "captured" | "blank" | "unavailable";
    }
  | {
      role: "assistant";
      text: string;
      toolCalls: ToolCall[];
      providerMetadata?: Record<string, unknown>;
    }
  | { role: "tool_results"; results: ToolResult[] };

export type CompletionResult = {
  text: string;
  toolCalls: ToolCall[];
  streamedText?: boolean;
  assistantMetadata?: Record<string, unknown>;
};

export type CompletionRequest = {
  settings: ResolvedAiSettings;
  system: string;
  turns: ConversationTurn[];
  tools: AgentTool[];
  signal?: AbortSignal;
  /**
   * Per-user credentials for the ChatGPT (subscription) provider. Absent for
   * API-key providers, which authenticate via `settings.apiKey` instead.
   */
  codexAuth?: { accessToken: string; accountId: string };
  reasoningEffort?: string;
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
};

export type AiProviderAdapter = {
  complete: (req: CompletionRequest) => Promise<CompletionResult>;
};

export class AiProviderError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "AiProviderError";
    this.status = status;
  }
}
