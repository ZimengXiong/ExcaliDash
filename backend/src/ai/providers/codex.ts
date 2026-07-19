import { config } from "../../config";
import {
  AiProviderError,
  type AiProviderAdapter,
  type CompletionRequest,
  type CompletionResult,
} from "./types";
import {
  CodexStreamAccumulator,
  buildResponsesBody,
  normalizeCodexModel,
} from "./codexResponses";

// Adapter for the ChatGPT (subscription) provider. Authenticates with the
// user's own OAuth access token + account id and routes the tool-loop through
// the ChatGPT-backed Codex `/responses` endpoint. The endpoint always streams
// (SSE); we aggregate the stream into the same neutral {text, toolCalls} the
// other adapters return.

export const parseCodexSse = (
  accumulator: CodexStreamAccumulator,
  chunk: string,
): void => {
  for (const frame of chunk.split(/\r?\n\r?\n/)) {
    const dataLines: string[] = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) continue;
    const data = dataLines.join("\n");
    if (data === "[DONE]") continue;
    try {
      accumulator.push(JSON.parse(data));
    } catch {
      /* ignore keep-alives / partial frames */
    }
  }
};

const readStream = async (
  response: Response,
  signal: AbortSignal | undefined,
  onTextDelta?: (delta: string) => void,
  onThinkingDelta?: (delta: string) => void,
): Promise<CodexStreamAccumulator> => {
  const accumulator = new CodexStreamAccumulator(onTextDelta, onThinkingDelta);
  const body = response.body;
  if (!body) {
    const text = await response.text().catch(() => "");
    parseCodexSse(accumulator, text);
    return accumulator;
  }
  const reader = (body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    if (signal?.aborted) break;
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let separator: RegExpExecArray | null;
    while ((separator = /\r?\n\r?\n/.exec(buffer)) !== null) {
      const end = separator.index + separator[0].length;
      parseCodexSse(accumulator, buffer.slice(0, end));
      buffer = buffer.slice(end);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim().length > 0) parseCodexSse(accumulator, buffer);
  return accumulator;
};

export const codexAdapter: AiProviderAdapter = {
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const {
      settings,
      system,
      turns,
      tools,
      signal,
      codexAuth,
      reasoningEffort,
      onTextDelta,
      onThinkingDelta,
    } = req;
    if (!codexAuth) {
      throw new AiProviderError(
        "ChatGPT account is not connected",
        401,
      );
    }
    const c = config.ai.chatgpt;
    const model = normalizeCodexModel(settings.model, c.models[0] ?? "gpt-5.5");
    const body = buildResponsesBody({ model, system, turns, tools, reasoningEffort });

    const url = new URL(`${c.codexBaseUrl}/responses`);
    url.searchParams.set("client_version", c.clientVersion);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "text/event-stream",
          authorization: `Bearer ${codexAuth.accessToken}`,
          "chatgpt-account-id": codexAuth.accountId,
          "OpenAI-Beta": "responses=experimental",
          originator: c.originator,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      throw new AiProviderError(
        `Failed to reach the ChatGPT Codex backend: ${(error as Error).message}`,
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      // 401 => token no longer accepted; the route maps this to a reconnect
      // prompt. 429 => the user's own subscription hit its usage limit.
      const status =
        response.status === 401
          ? 401
          : response.status === 429
            ? 429
            : 502;
      throw new AiProviderError(
        `ChatGPT Codex backend error ${response.status}: ${detail.slice(0, 500)}`,
        status,
      );
    }

    const accumulator = await readStream(
      response,
      signal,
      onTextDelta,
      onThinkingDelta,
    );
    const parsed = accumulator.result();
    if (parsed.error) {
      throw new AiProviderError(`ChatGPT Codex backend: ${parsed.error}`);
    }
    return {
      text: parsed.text,
      toolCalls: parsed.toolCalls,
      streamedText: Boolean(onTextDelta),
      assistantMetadata: parsed.assistantMetadata,
    };
  },
};
