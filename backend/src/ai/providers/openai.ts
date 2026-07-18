import {
  AiProviderError,
  type AiProviderAdapter,
  type CompletionRequest,
  type CompletionResult,
  type ConversationTurn,
  type ToolCall,
} from "./types";
import { readOpenAiStream } from "./openaiStream";

// OpenAI Chat Completions adapter. Also serves any OpenAI-compatible endpoint
// via a custom baseUrl (AI_PROVIDER=custom).

type OpenAiMessage =
  | {
      role: "system" | "user";
      content:
        | string
        | (
            | { type: "text"; text: string }
            | { type: "image_url"; image_url: { url: string } }
          )[];
    }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: {
        id: string;
        type: "function";
        function: { name: string; arguments: string };
        extra_content?: unknown;
      }[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

type OpenAiResponseToolCall = {
  id: string;
  function: { name: string; arguments: string };
  extra_content?: unknown;
};

export const parseOpenAiToolCalls = (
  calls: OpenAiResponseToolCall[] | undefined,
): ToolCall[] =>
  (calls ?? []).map((call) => {
    let input: unknown = {};
    try {
      input = call.function.arguments ? JSON.parse(call.function.arguments) : {};
    } catch {
      input = {};
    }
    return {
      id: call.id,
      name: call.function.name,
      input,
      ...(call.extra_content !== undefined
        ? { providerMetadata: { openaiExtraContent: call.extra_content } }
        : {}),
    };
  });

export const toOpenAiMessages = (
  system: string,
  turns: ConversationTurn[],
): OpenAiMessage[] => {
  const messages: OpenAiMessage[] = [{ role: "system", content: system }];
  for (const turn of turns) {
    if (turn.role === "user") {
      messages.push({
        role: "user",
        content: turn.imageDataUrl
          ? [
              { type: "text", text: turn.text },
              { type: "image_url", image_url: { url: turn.imageDataUrl } },
            ]
          : turn.text,
      });
    } else if (turn.role === "assistant") {
      messages.push({
        role: "assistant",
        content: turn.text || null,
        tool_calls:
          turn.toolCalls.length > 0
            ? turn.toolCalls.map((c) => {
                const extraContent = c.providerMetadata?.openaiExtraContent;
                return {
                  id: c.id,
                  type: "function" as const,
                  function: { name: c.name, arguments: JSON.stringify(c.input) },
                  ...(extraContent !== undefined
                    ? { extra_content: extraContent }
                    : {}),
                };
              })
            : undefined,
      });
    } else {
      for (const r of turn.results) {
        messages.push({ role: "tool", tool_call_id: r.id, content: r.content });
        if (r.imageDataUrl) {
          messages.push({
            role: "user",
            content: [
              { type: "text", text: "Current canvas snapshot requested by view_canvas." },
              { type: "image_url", image_url: { url: r.imageDataUrl } },
            ],
          });
        }
      }
    }
  }
  return messages;
};

export const openaiAdapter: AiProviderAdapter = {
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const {
      settings,
      system,
      turns,
      tools,
      signal,
      reasoningEffort,
      onTextDelta,
      onThinkingDelta,
    } = req;
    if (!settings.apiKey || !settings.baseUrl || !settings.model) {
      throw new AiProviderError("AI provider is not configured", 503);
    }

    const body = {
      model: settings.model,
      max_tokens: settings.maxTokensPerRequest,
      messages: toOpenAiMessages(system, turns),
      tools: tools.map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      })),
      tool_choice: "auto",
      parallel_tool_calls: false,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      ...(/gemini/i.test(settings.model) || /generativelanguage\.googleapis\.com/i.test(settings.baseUrl)
        ? {
            extra_body: {
              google: { thinking_config: { include_thoughts: true } },
            },
          }
        : {}),
      ...(onTextDelta || onThinkingDelta ? { stream: true } : {}),
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

    if (onTextDelta || onThinkingDelta) {
      const streamed = await readOpenAiStream(
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
      };
    }

    const data = (await response.json()) as {
      choices?: {
        message?: {
          content?: string | null;
          tool_calls?: {
            id: string;
            function: { name: string; arguments: string };
            extra_content?: unknown;
          }[];
        };
      }[];
    };
    const message = data.choices?.[0]?.message;
    const text = message?.content ?? "";
    const toolCalls = parseOpenAiToolCalls(message?.tool_calls);
    return { text, toolCalls };
  },
};
