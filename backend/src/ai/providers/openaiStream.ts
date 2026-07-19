import type { ToolCall } from "./types";

type PendingCall = {
  id: string;
  name: string;
  arguments: string;
  extraContent?: unknown;
};

const takeSseFrame = (
  buffer: string,
): { frame: string; rest: string } | null => {
  const separator = /\r?\n\r?\n/.exec(buffer);
  if (!separator || separator.index === undefined) return null;
  return {
    frame: buffer.slice(0, separator.index),
    rest: buffer.slice(separator.index + separator[0].length),
  };
};

const thoughtText = (delta: Record<string, any>): string => {
  for (const value of [
    delta.reasoning_content,
    delta.reasoning,
    delta.thinking,
    delta.extra_content?.google?.thought_summary,
  ]) {
    if (typeof value === "string") return value;
    if (value && typeof value.text === "string") return value.text;
  }
  return "";
};

export const readOpenAiStream = async (
  response: Response,
  signal?: AbortSignal,
  onTextDelta?: (delta: string) => void,
  onThinkingDelta?: (delta: string) => void,
): Promise<{
  text: string;
  toolCalls: ToolCall[];
  finishReason?: string;
  error?: string;
}> => {
  const reader = response.body?.getReader();
  if (!reader) return { text: "", toolCalls: [], error: "Missing response stream" };
  const decoder = new TextDecoder();
  const calls = new Map<number, PendingCall>();
  let buffer = "";
  let text = "";
  let finishReason: string | undefined;
  let failure: string | undefined;
  const consume = (frame: string) => {
    const data = frame.split(/\r?\n/).filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim()).join("\n");
    if (!data || data === "[DONE]") return;
    try {
      const payload = JSON.parse(data);
      if (payload.error?.message) failure = payload.error.message;
      const rawFinishReason = payload.choices?.[0]?.finish_reason;
      if (typeof rawFinishReason === "string" && rawFinishReason) {
        finishReason = rawFinishReason;
      }
      const delta = payload.choices?.[0]?.delta ?? {};
      if (typeof delta.content === "string") {
        text += delta.content;
        onTextDelta?.(delta.content);
      }
      const thinking = thoughtText(delta);
      if (thinking) onThinkingDelta?.(thinking);
      for (const raw of delta.tool_calls ?? []) {
        const index = typeof raw.index === "number" ? raw.index : calls.size;
        const call = calls.get(index) ?? { id: "", name: "", arguments: "" };
        if (typeof raw.id === "string") call.id = raw.id;
        if (typeof raw.function?.name === "string") call.name += raw.function.name;
        if (typeof raw.function?.arguments === "string") call.arguments += raw.function.arguments;
        if (raw.extra_content !== undefined) call.extraContent = raw.extra_content;
        calls.set(index, call);
      }
    } catch { /* ignore malformed keep-alives */ }
  };
  while (!signal?.aborted) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let next: ReturnType<typeof takeSseFrame>;
    while ((next = takeSseFrame(buffer)) !== null) {
      consume(next.frame);
      buffer = next.rest;
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) consume(buffer);
  const toolCalls = [...calls.values()].map((call) => {
    let input: unknown = {};
    try { input = call.arguments ? JSON.parse(call.arguments) : {}; } catch { /* model can retry */ }
    return {
      id: call.id,
      name: call.name,
      input,
      ...(call.extraContent !== undefined
        ? { providerMetadata: { openaiExtraContent: call.extraContent } }
        : {}),
    };
  });
  return {
    text,
    toolCalls,
    ...(finishReason ? { finishReason } : {}),
    ...(failure ? { error: failure } : {}),
  };
};
