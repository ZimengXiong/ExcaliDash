import type { AgentTool } from "../toolDefs";
import type { ResolvedAiSettings } from "../settings";

// Neutral conversation model the tool loop builds and each provider serializes
// to its own wire format.
export type ToolCall = {
  id: string;
  name: string;
  input: unknown;
};

export type ConversationTurn =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls: ToolCall[] }
  | { role: "tool_results"; results: { id: string; content: string }[] };

export type CompletionResult = {
  text: string;
  toolCalls: ToolCall[];
};

export type CompletionRequest = {
  settings: ResolvedAiSettings;
  system: string;
  turns: ConversationTurn[];
  tools: AgentTool[];
  signal?: AbortSignal;
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
