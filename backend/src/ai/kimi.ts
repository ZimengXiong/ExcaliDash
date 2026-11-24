import {
  AI_RESPONSE_JSON_SCHEMA,
  aiResponseSchema,
  type AiResponse,
} from "./operations";

export type KimiSettings = {
  apiKey: string;
  baseUrl: string;
  model: string;
  reasoningEffort: "low" | "high" | "max";
  timeoutMs: number;
};

export type AiHistoryMessage = {
  role: string;
  content: string;
  operations?: string | null;
};

export class KimiClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 502,
  ) {
    super(message);
    this.name = "KimiClientError";
  }
}

const SYSTEM_PROMPT = `You are Kimi, an AI assistant embedded in an Excalidraw board.
Answer the user's request and, when useful, modify the board with structured operations.
Return one JSON object with exactly these fields:
{
  "message": "short natural-language response",
  "operations": []
}

Supported operations:
- {"type":"create","elements":[element,...]}
- {"type":"update","elementId":"existing-id","changes":{...}}
- {"type":"delete","elementId":"existing-id"}

Create elements support:
- type: rectangle, ellipse, diamond, text, arrow, line, or frame
- required: type, x, y
- optional: id, children, name, width, height, angle, strokeColor,
  backgroundColor, fillStyle, strokeWidth, strokeStyle, roughness, opacity,
  fontSize, text, label, points
- label is {"text":"..."} and adds centered text to a shape.
- text elements use text directly.
- IDs are optional for ordinary created elements. When creating a native frame,
  give the frame and any new children unique IDs and set the frame's children
  array to the IDs it contains. Existing board elements can also be children.
  Always use type frame for a requested frame, never substitute a rectangle.
- arrows and lines should include points, for example [[0,0],[200,0]].
- Coordinates use the board's scene coordinate system. Arrange new content neatly
  and avoid overlapping existing elements unless the user requests it.

Updates support x, y, width, height, angle, strokeColor, backgroundColor,
fillStyle, strokeWidth, strokeStyle, roughness, opacity, fontSize, and text.
Use exact IDs from the current board for updates and deletes. To change a shape's
label, update its bound text element. Never invent IDs for existing elements.
Only delete elements when the user explicitly asks. Use an empty operations array
for questions, summaries, or explanations. Do not return markdown or extra fields.`;

export const buildKimiMessages = (
  history: AiHistoryMessage[],
  boardContext: unknown,
  request: string,
) => [
  { role: "system", content: SYSTEM_PROMPT },
  ...history.map((message) => ({
    role: message.role,
    content:
      message.role === "assistant" && message.operations
        ? JSON.stringify({
            message: message.content,
            operations: JSON.parse(message.operations),
          })
        : message.content,
  })),
  {
    role: "user",
    content: `Current board JSON:\n${JSON.stringify(
      boardContext,
    )}\n\nUser request:\n${request}`,
  },
];

const buildRequestBody = (
  settings: KimiSettings,
  history: AiHistoryMessage[],
  boardContext: unknown,
  request: string,
  stream: boolean,
) => ({
  model: settings.model,
  reasoning_effort: settings.reasoningEffort,
  messages: buildKimiMessages(history, boardContext, request),
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "board_ai_response",
      strict: true,
      schema: AI_RESPONSE_JSON_SCHEMA,
    },
  },
  stream,
  ...(stream ? { stream_options: { include_usage: true } } : {}),
});

const requestSignal = (timeoutMs: number, signal?: AbortSignal) => {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([timeout, signal]) : timeout;
};

const fetchKimi = async (
  settings: KimiSettings,
  history: AiHistoryMessage[],
  boardContext: unknown,
  request: string,
  stream: boolean,
  signal?: AbortSignal,
): Promise<Response> => {
  try {
    return await fetch(`${settings.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        buildRequestBody(settings, history, boardContext, request, stream),
      ),
      signal: requestSignal(settings.timeoutMs, signal),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new KimiClientError("Kimi took too long to respond", 504);
    }
    throw new KimiClientError("Could not connect to Kimi", 502);
  }
};

const ensureKimiResponseOk = async (response: Response) => {
  if (response.ok) return;
  const errorBody = await response.text().catch(() => "");
  console.warn("[AI] Kimi rejected the request", {
    status: response.status,
    responsePreview: errorBody.slice(0, 1000),
  });
  if (response.status === 401 || response.status === 403) {
    throw new KimiClientError(
      "Kimi rejected the API key or model access. Check the backend AI configuration.",
    );
  }
  if (response.status === 429) {
    throw new KimiClientError(
      "Kimi rate limit reached. Try again shortly.",
      429,
    );
  }
  throw new KimiClientError(
    `Kimi request failed with status ${response.status}`,
  );
};

const parseAiContent = (content: string): AiResponse => {
  let parsedContent: unknown;
  try {
    parsedContent = JSON.parse(content);
  } catch {
    throw new KimiClientError("Kimi returned invalid board operations");
  }
  const validated = aiResponseSchema.safeParse(parsedContent);
  if (!validated.success) {
    console.warn("[AI] Kimi response failed board-operation validation", {
      issues: validated.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
      responsePreview: content.slice(0, 1000),
    });
    throw new KimiClientError("Kimi returned invalid board operations");
  }
  return validated.data;
};

export const requestKimiBoardResponse = async (
  settings: KimiSettings,
  history: AiHistoryMessage[],
  boardContext: unknown,
  request: string,
): Promise<AiResponse> => {
  const response = await fetchKimi(
    settings,
    history,
    boardContext,
    request,
    false,
  );
  await ensureKimiResponseOk(response);

  let payload: any;
  try {
    payload = await response.json();
  } catch {
    throw new KimiClientError("Kimi returned an invalid response");
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new KimiClientError("Kimi returned no assistant message");
  }
  return parseAiContent(content);
};

export const streamKimiBoardResponse = async (
  settings: KimiSettings,
  history: AiHistoryMessage[],
  boardContext: unknown,
  request: string,
  onReasoning: (text: string) => void,
  signal?: AbortSignal,
): Promise<AiResponse> => {
  const response = await fetchKimi(
    settings,
    history,
    boardContext,
    request,
    true,
    signal,
  );
  await ensureKimiResponseOk(response);
  if (!response.body) {
    throw new KimiClientError("Kimi returned no streaming response");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";

  const processLine = (line: string) => {
    const trimmed = line.trimEnd();
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let event: any;
    try {
      event = JSON.parse(data);
    } catch {
      throw new KimiClientError("Kimi returned an invalid streaming response");
    }
    const delta = event?.choices?.[0]?.delta;
    if (typeof delta?.reasoning_content === "string") {
      onReasoning(delta.reasoning_content);
    }
    if (typeof delta?.content === "string") content += delta.content;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        processLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) processLine(buffer);
  } catch (error) {
    if (error instanceof KimiClientError) throw error;
    throw new KimiClientError("The Kimi response stream was interrupted");
  } finally {
    reader.releaseLock();
  }

  if (!content) throw new KimiClientError("Kimi returned no assistant message");
  return parseAiContent(content);
};
