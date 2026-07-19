import type { AgentTool } from "../toolDefs";
import type { ConversationTurn, ToolCall } from "./types";

// Pure request-shaping and SSE-parsing helpers for the ChatGPT-backed Codex
// `/responses` endpoint. Kept separate from the network adapter so the wire
// format can be unit-tested without a live backend.
//
// The Codex backend runs stateless (`store: false`), which imposes several
// non-obvious requirements — omit any and the stream yields no assistant text:
//   - `reasoning` must be configured (Codex models always reason)
//   - `include` must request `reasoning.encrypted_content`
//   - input items must not carry server-side ids
//   - `max_output_tokens` is rejected

/** Validation happens against the user's live `/models` catalog upstream. */
export const normalizeCodexModel = (
  model: string | null | undefined,
  fallback: string,
): string => {
  const raw = (model ?? "").trim();
  if (!raw) return fallback;
  const slug = raw.includes("/") ? raw.split("/").pop()! : raw;
  return slug;
};

type ResponsesInputItem =
  | { type: "message"; role: "user" | "assistant"; content: unknown[] }
  | {
      type: "function_call";
      name: string;
      arguments: string;
      call_id: string;
    }
  | { type: "function_call_output"; call_id: string; output: string }
  | {
      type: "reasoning";
      encrypted_content: string;
      summary?: unknown[];
    };

/** Serializes the neutral conversation into Codex `/responses` input items. */
export const toResponsesInput = (turns: ConversationTurn[]): ResponsesInputItem[] => {
  const items: ResponsesInputItem[] = [];
  for (const turn of turns) {
    if (turn.role === "user") {
      items.push({
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: turn.text },
          ...(turn.imageDataUrl
            ? [{ type: "input_image", image_url: turn.imageDataUrl }]
            : []),
        ],
      });
    } else if (turn.role === "assistant") {
      const reasoningItems = turn.providerMetadata?.codexReasoningItems;
      if (Array.isArray(reasoningItems)) {
        for (const item of reasoningItems) {
          if (isRecord(item) && item.type === "reasoning") {
            items.push(item as ResponsesInputItem);
          }
        }
      }
      if (turn.text) {
        items.push({
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: turn.text }],
        });
      }
      for (const call of turn.toolCalls) {
        items.push({
          type: "function_call",
          name: call.name,
          arguments: JSON.stringify(call.input ?? {}),
          call_id: call.id,
        });
      }
    } else {
      for (const r of turn.results) {
        items.push({
          type: "function_call_output",
          call_id: r.id,
          output: r.content,
        });
        if (r.imageDataUrl) {
          items.push({
            type: "message",
            role: "user",
            content: [
              { type: "input_text", text: "Current canvas snapshot requested by view_canvas." },
              { type: "input_image", image_url: r.imageDataUrl },
            ],
          });
        }
      }
    }
  }
  return items;
};

/** Builds the JSON body for a Codex `/responses` call. */
export const buildResponsesBody = (params: {
  model: string;
  system: string;
  turns: ConversationTurn[];
  tools: AgentTool[];
  reasoningEffort?: string;
  toolChoice?: "auto" | "required" | "none";
}): Record<string, unknown> => ({
  model: params.model,
  instructions: params.system,
  input: toResponsesInput(params.turns),
  tools: params.tools.map((t) => ({
    type: "function" as const,
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
    strict: false,
  })),
  tool_choice: params.toolChoice ?? "auto",
  parallel_tool_calls: false,
  store: false,
  stream: true,
  reasoning: { effort: params.reasoningEffort ?? "medium", summary: "auto" },
  text: { verbosity: "medium" },
  include: ["reasoning.encrypted_content"],
});

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const textFromMessageItem = (item: Record<string, unknown>): string => {
  const content = item.content;
  if (!Array.isArray(content)) return "";
  let text = "";
  for (const part of content) {
    if (isRecord(part) && part.type === "output_text" && typeof part.text === "string") {
      text += part.text;
    }
  }
  return text;
};

const toolCallFromItem = (item: Record<string, unknown>): ToolCall | null => {
  if (item.type !== "function_call") return null;
  const callId = item.call_id ?? item.id;
  const name = item.name;
  if (typeof callId !== "string" || typeof name !== "string") return null;
  let input: unknown = {};
  if (typeof item.arguments === "string") {
    try {
      input = item.arguments ? JSON.parse(item.arguments) : {};
    } catch {
      input = {};
    }
  }
  return { id: callId, name, input };
};

export type CodexParseResult = {
  text: string;
  toolCalls: ToolCall[];
  assistantMetadata?: Record<string, unknown>;
  error?: string;
};

/**
 * Accumulates parsed Codex SSE event objects into a final completion. Prefers
 * the terminal `response.completed` output array; falls back to accumulated
 * text deltas and per-item `function_call` events for resilience.
 */
export class CodexStreamAccumulator {
  private deltaText = "";
  private itemCalls = new Map<string, ToolCall>();
  private finalText: string | null = null;
  private finalCalls: ToolCall[] | null = null;
  private failure: string | null = null;
  private reasoningItems: Record<string, unknown>[] = [];

  constructor(
    private readonly onTextDelta?: (delta: string) => void,
    private readonly onThinkingDelta?: (delta: string) => void,
  ) {}

  push(event: unknown): void {
    if (!isRecord(event)) return;
    const type = typeof event.type === "string" ? event.type : "";
    if (type === "response.output_text.delta" && typeof event.delta === "string") {
      this.deltaText += event.delta;
      this.onTextDelta?.(event.delta);
      return;
    }
    if (
      type === "response.reasoning_summary_text.delta" &&
      typeof event.delta === "string"
    ) {
      this.onThinkingDelta?.(event.delta);
      return;
    }
    if (type === "response.output_item.done" && isRecord(event.item)) {
      const call = toolCallFromItem(event.item);
      if (call) this.itemCalls.set(call.id, call);
      return;
    }
    if (type === "response.completed" && isRecord(event.response)) {
      this.absorbFinal(event.response);
      return;
    }
    if (type === "response.failed" || type === "error") {
      this.failure = this.extractError(event);
    }
  }

  private absorbFinal(response: Record<string, unknown>): void {
    const output = response.output;
    if (!Array.isArray(output)) return;
    let text = "";
    const calls: ToolCall[] = [];
    for (const item of output) {
      if (!isRecord(item)) continue;
      if (item.type === "message") text += textFromMessageItem(item);
      if (item.type === "reasoning" && typeof item.encrypted_content === "string") {
        this.reasoningItems.push({
          type: "reasoning",
          encrypted_content: item.encrypted_content,
          ...(Array.isArray(item.summary) ? { summary: item.summary } : {}),
        });
      }
      const call = toolCallFromItem(item);
      if (call) calls.push(call);
    }
    this.finalText = text;
    this.finalCalls = calls;
  }

  private extractError(event: Record<string, unknown>): string {
    const fromResponse = isRecord(event.response) ? event.response.error : undefined;
    const err = isRecord(fromResponse) ? fromResponse : isRecord(event.error) ? event.error : event;
    const message = isRecord(err) && typeof err.message === "string" ? err.message : "";
    return message || "Codex responses request failed";
  }

  result(): CodexParseResult {
    if (this.failure) return { text: "", toolCalls: [], error: this.failure };
    const text = this.finalText ?? this.deltaText;
    const calls =
      this.finalCalls && this.finalCalls.length > 0
        ? this.finalCalls
        : [...this.itemCalls.values()];
    return {
      text,
      toolCalls: calls,
      ...(this.reasoningItems.length > 0
        ? { assistantMetadata: { codexReasoningItems: this.reasoningItems } }
        : {}),
    };
  }
}
