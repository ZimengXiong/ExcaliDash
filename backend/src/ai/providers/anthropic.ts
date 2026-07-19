import {
  AiProviderError,
  type AiProviderAdapter,
  type CompletionRequest,
  type CompletionResult,
  type ConversationTurn,
  type ToolCall,
} from "./types";
import { readAnthropicStream } from "./anthropicStream";
import { anthropicAdaptiveThinkingForModel } from "../providerDefinitions";

const ANTHROPIC_VERSION = "2023-06-01";

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; signature: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string | AnthropicBlock[] };

const imageBlockFromDataUrl = (dataUrl: string): AnthropicBlock | null => {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s.exec(dataUrl);
  if (!match) return null;
  return {
    type: "image",
    source: { type: "base64", media_type: match[1], data: match[2] },
  };
};

const toMessages = (turns: ConversationTurn[]) => {
  const messages: { role: "user" | "assistant"; content: AnthropicBlock[] }[] = [];
  for (const turn of turns) {
    if (turn.role === "user") {
      const image = turn.imageDataUrl
        ? imageBlockFromDataUrl(turn.imageDataUrl)
        : null;
      messages.push({
        role: "user",
        content: [
          { type: "text", text: turn.text },
          ...(image ? [image] : []),
        ],
      });
    } else if (turn.role === "assistant") {
      const content: AnthropicBlock[] = [];
      const thinkingBlocks = turn.providerMetadata?.anthropicThinkingBlocks;
      if (Array.isArray(thinkingBlocks)) {
        for (const block of thinkingBlocks) {
          if (
            block && typeof block === "object" &&
            (block as any).type === "thinking"
          ) content.push(block as AnthropicBlock);
        }
      }
      if (turn.text) content.push({ type: "text", text: turn.text });
      for (const call of turn.toolCalls) {
        content.push({ type: "tool_use", id: call.id, name: call.name, input: call.input });
      }
      messages.push({ role: "assistant", content });
    } else {
      messages.push({
        role: "user",
        content: turn.results.map((r) => {
          const image = r.imageDataUrl ? imageBlockFromDataUrl(r.imageDataUrl) : null;
          return {
            type: "tool_result" as const,
            tool_use_id: r.id,
            content: image
              ? [{ type: "text" as const, text: r.content }, image]
              : r.content,
          };
        }),
      });
    }
  }
  return messages;
};

export const anthropicAdapter: AiProviderAdapter = {
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const {
      settings,
      system,
      turns,
      tools,
      signal,
      reasoningEffort,
      toolChoice,
      onTextDelta,
      onThinkingDelta,
    } = req;
    if (!settings.apiKey || !settings.baseUrl || !settings.model) {
      throw new AiProviderError("AI provider is not configured", 503);
    }

    const useAnthropicReasoning =
      settings.provider === "anthropic" && Boolean(reasoningEffort);
    const body = {
      model: settings.model,
      max_tokens: settings.maxTokensPerRequest,
      system,
      messages: toMessages(turns),
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      })),
      ...(toolChoice === "required"
        ? { tool_choice: { type: "any" as const } }
        : toolChoice === "none"
          ? { tool_choice: { type: "none" as const } }
          : {}),
      ...(useAnthropicReasoning
        ? { output_config: { effort: reasoningEffort } }
        : {}),
      ...(useAnthropicReasoning &&
      anthropicAdaptiveThinkingForModel(settings.model)
        ? { thinking: { type: "adaptive", display: "summarized" } }
        : {}),
      ...(onTextDelta || onThinkingDelta ? { stream: true } : {}),
    };

    let response: Response;
    try {
      response = await fetch(`${settings.baseUrl.replace(/\/+$/, "")}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": settings.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      throw new AiProviderError(
        `Failed to reach Anthropic API: ${(error as Error).message}`,
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new AiProviderError(
        `Anthropic API error ${response.status}: ${detail.slice(0, 500)}`,
        response.status >= 400 && response.status <= 599
          ? response.status
          : 502,
      );
    }

    if (onTextDelta || onThinkingDelta) {
      const streamed = await readAnthropicStream(
        response,
        signal,
        onTextDelta,
        onThinkingDelta,
      );
      if (streamed.error) throw new AiProviderError(streamed.error);
      return {
        text: streamed.text,
        toolCalls: streamed.toolCalls,
        streamedText: Boolean(onTextDelta),
        ...(streamed.thinkingBlocks.length > 0
          ? { assistantMetadata: { anthropicThinkingBlocks: streamed.thinkingBlocks } }
          : {}),
      };
    }

    const data = (await response.json()) as {
      content?: AnthropicBlock[];
    };
    let text = "";
    const toolCalls: ToolCall[] = [];
    const thinkingBlocks: AnthropicBlock[] = [];
    for (const block of data.content ?? []) {
      if (block.type === "text") {
        text += block.text;
      } else if (block.type === "thinking") {
        thinkingBlocks.push(block);
      } else if (block.type === "tool_use") {
        toolCalls.push({ id: block.id, name: block.name, input: block.input });
      }
    }
    return {
      text,
      toolCalls,
      ...(thinkingBlocks.length > 0
        ? { assistantMetadata: { anthropicThinkingBlocks: thinkingBlocks } }
        : {}),
    };
  },
};
