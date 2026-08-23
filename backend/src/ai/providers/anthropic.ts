import {
  AiProviderError,
  type AiProviderAdapter,
  type CompletionRequest,
  type CompletionResult,
  type ConversationTurn,
  type ToolCall,
} from "./types";

const ANTHROPIC_VERSION = "2023-06-01";

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

const toMessages = (turns: ConversationTurn[]) => {
  const messages: { role: "user" | "assistant"; content: AnthropicBlock[] }[] = [];
  for (const turn of turns) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: [{ type: "text", text: turn.text }] });
    } else if (turn.role === "assistant") {
      const content: AnthropicBlock[] = [];
      if (turn.text) content.push({ type: "text", text: turn.text });
      for (const call of turn.toolCalls) {
        content.push({ type: "tool_use", id: call.id, name: call.name, input: call.input });
      }
      messages.push({ role: "assistant", content });
    } else {
      messages.push({
        role: "user",
        content: turn.results.map((r) => ({
          type: "tool_result" as const,
          tool_use_id: r.id,
          content: r.content,
        })),
      });
    }
  }
  return messages;
};

export const anthropicAdapter: AiProviderAdapter = {
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const { settings, system, turns, tools, signal } = req;
    if (!settings.apiKey || !settings.baseUrl || !settings.model) {
      throw new AiProviderError("AI provider is not configured", 503);
    }

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
        response.status === 429 ? 429 : 502,
      );
    }

    const data = (await response.json()) as {
      content?: AnthropicBlock[];
    };
    let text = "";
    const toolCalls: ToolCall[] = [];
    for (const block of data.content ?? []) {
      if (block.type === "text") {
        text += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({ id: block.id, name: block.name, input: block.input });
      }
    }
    return { text, toolCalls };
  },
};
