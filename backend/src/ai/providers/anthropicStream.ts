import type { ToolCall } from "./types";

type StreamBlock = {
  type: string;
  text?: string;
  thinking?: string;
  signature?: string;
  id?: string;
  name?: string;
  partialJson?: string;
};

export type AnthropicStreamResult = {
  text: string;
  toolCalls: ToolCall[];
  thinkingBlocks: Record<string, unknown>[];
  error?: string;
};

const applyEvent = (
  raw: unknown,
  blocks: Map<number, StreamBlock>,
  onTextDelta?: (delta: string) => void,
  onThinkingDelta?: (delta: string) => void,
): string | undefined => {
  if (!raw || typeof raw !== "object") return;
  const event = raw as Record<string, any>;
  const index = typeof event.index === "number" ? event.index : -1;
  if (event.type === "content_block_start" && index >= 0) {
    const block = event.content_block ?? {};
    blocks.set(index, {
      type: typeof block.type === "string" ? block.type : "unknown",
      text: typeof block.text === "string" ? block.text : "",
      thinking: typeof block.thinking === "string" ? block.thinking : "",
      signature: typeof block.signature === "string" ? block.signature : "",
      id: typeof block.id === "string" ? block.id : undefined,
      name: typeof block.name === "string" ? block.name : undefined,
      partialJson: "",
    });
  } else if (event.type === "content_block_delta" && index >= 0) {
    const block = blocks.get(index);
    if (!block) return;
    const delta = event.delta ?? {};
    if (delta.type === "text_delta" && typeof delta.text === "string") {
      block.text = (block.text ?? "") + delta.text;
      onTextDelta?.(delta.text);
    } else if (delta.type === "thinking_delta" && typeof delta.thinking === "string") {
      block.thinking = (block.thinking ?? "") + delta.thinking;
      onThinkingDelta?.(delta.thinking);
    } else if (delta.type === "signature_delta" && typeof delta.signature === "string") {
      block.signature = (block.signature ?? "") + delta.signature;
    } else if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
      block.partialJson = (block.partialJson ?? "") + delta.partial_json;
    }
  } else if (event.type === "error") {
    return typeof event.error?.message === "string" ? event.error.message : "Anthropic stream failed";
  }
};

export const readAnthropicStream = async (
  response: Response,
  signal?: AbortSignal,
  onTextDelta?: (delta: string) => void,
  onThinkingDelta?: (delta: string) => void,
): Promise<AnthropicStreamResult> => {
  const blocks = new Map<number, StreamBlock>();
  const reader = response.body?.getReader();
  if (!reader) return { text: "", toolCalls: [], thinkingBlocks: [], error: "Missing response stream" };
  const decoder = new TextDecoder();
  let buffer = "";
  let failure: string | undefined;
  const consume = (frame: string) => {
    const data = frame.split("\n").filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim()).join("\n");
    if (!data || data === "[DONE]") return;
    try {
      failure = applyEvent(JSON.parse(data), blocks, onTextDelta, onThinkingDelta) ?? failure;
    } catch { /* ignore malformed keep-alives */ }
  };
  while (!signal?.aborted) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let separator: number;
    while ((separator = buffer.indexOf("\n\n")) !== -1) {
      consume(buffer.slice(0, separator));
      buffer = buffer.slice(separator + 2);
    }
  }
  if (buffer.trim()) consume(buffer);

  let text = "";
  const toolCalls: ToolCall[] = [];
  const thinkingBlocks: Record<string, unknown>[] = [];
  for (const block of [...blocks.entries()].sort(([a], [b]) => a - b).map((entry) => entry[1])) {
    if (block.type === "text") text += block.text ?? "";
    if (block.type === "thinking") {
      thinkingBlocks.push({
        type: "thinking",
        thinking: block.thinking ?? "",
        signature: block.signature ?? "",
      });
    }
    if (block.type === "tool_use" && block.id && block.name) {
      let input: unknown = {};
      try { input = block.partialJson ? JSON.parse(block.partialJson) : {}; } catch { /* model can retry */ }
      toolCalls.push({ id: block.id, name: block.name, input });
    }
  }
  return { text, toolCalls, thinkingBlocks, ...(failure ? { error: failure } : {}) };
};
