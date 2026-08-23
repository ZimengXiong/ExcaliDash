import {
  AiProviderError,
  type AiProviderAdapter,
  type CompletionRequest,
  type CompletionResult,
  type ConversationTurn,
  type ToolCall,
} from "./types";

// OpenAI Chat Completions adapter. Also serves any OpenAI-compatible endpoint
// via a custom baseUrl (AI_PROVIDER=custom).

type OpenAiMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: {
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

const toMessages = (system: string, turns: ConversationTurn[]): OpenAiMessage[] => {
  const messages: OpenAiMessage[] = [{ role: "system", content: system }];
  for (const turn of turns) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.text });
    } else if (turn.role === "assistant") {
      messages.push({
        role: "assistant",
        content: turn.text || null,
        tool_calls:
          turn.toolCalls.length > 0
            ? turn.toolCalls.map((c) => ({
                id: c.id,
                type: "function" as const,
                function: { name: c.name, arguments: JSON.stringify(c.input) },
              }))
            : undefined,
      });
    } else {
      for (const r of turn.results) {
        messages.push({ role: "tool", tool_call_id: r.id, content: r.content });
      }
    }
  }
  return messages;
};

export const openaiAdapter: AiProviderAdapter = {
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const { settings, system, turns, tools, signal } = req;
    if (!settings.apiKey || !settings.baseUrl || !settings.model) {
      throw new AiProviderError("AI provider is not configured", 503);
    }

    const body = {
      model: settings.model,
      max_tokens: settings.maxTokensPerRequest,
      messages: toMessages(system, turns),
      tools: tools.map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      })),
    };

    let response: Response;
    try {
      response = await fetch(
        `${settings.baseUrl.replace(/\/+$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${settings.apiKey}`,
          },
          body: JSON.stringify(body),
          signal,
        },
      );
    } catch (error) {
      throw new AiProviderError(
        `Failed to reach OpenAI-compatible API: ${(error as Error).message}`,
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new AiProviderError(
        `OpenAI-compatible API error ${response.status}: ${detail.slice(0, 500)}`,
        response.status === 429 ? 429 : 502,
      );
    }

    const data = (await response.json()) as {
      choices?: {
        message?: {
          content?: string | null;
          tool_calls?: {
            id: string;
            function: { name: string; arguments: string };
          }[];
        };
      }[];
    };
    const message = data.choices?.[0]?.message;
    const text = message?.content ?? "";
    const toolCalls: ToolCall[] = [];
    for (const call of message?.tool_calls ?? []) {
      let input: unknown = {};
      try {
        input = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        input = {};
      }
      toolCalls.push({ id: call.id, name: call.function.name, input });
    }
    return { text, toolCalls };
  },
};
