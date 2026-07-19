import express from "express";
import { buildStructuralSummary } from "../agent/summary";
import type { ResolvedAiSettings } from "./settings";
import { AGENT_TOOLS } from "./toolDefs";
import { applyOpsBatch, type RegisterAiRoutesDeps } from "./applyOpsBatch";
import {
  checkpointStoredAssistant,
  createStoredChatTurn,
  finalizeStoredAssistant,
  loadConversationHistory,
  type StoredChatMessageDto,
} from "./chatPersistence";
import {
  AiProviderError,
  type AiProviderAdapter,
  type ConversationTurn,
  type ToolResult,
} from "./providers/types";
import { flagReconnect, type ChatGptAuth } from "./chatgpt/store";

const MAX_TOOL_ITERATIONS = 8;

const buildSystemPrompt = (name: string | null, summary: string): string =>
  [
    "You are a capable conversational agent embedded in an Excalidraw editor.",
    "Talk naturally with the user: answer questions, brainstorm, explain, and",
    "collaborate even when no canvas change is needed. Canvas tools are optional.",
    "Use the structural summary to understand the scene and apply_ops to edit it.",
    "Each new user message includes current structural state and, for nonblank",
    "canvases, an automatically captured image. Inspect that image directly.",
    "Do not call view_canvas when the message says a snapshot is attached; that",
    "tool would return the same capture. A blank canvas is valid, not an error.",
    "Element ids in the summary are the ids to reference in ops. After each",
    "apply_ops call you receive an updated summary; keep it in mind.",
    "For multi-element diagrams, create shapes with short refs, connect them via",
    "$ref in the same atomic batch, then finish that batch with layout/align/",
    "distribute. Prefer 120×60 or larger labeled nodes, 60-100px whitespace,",
    "short labels, consistent styles, and edge-bound connectors. Fix any overlap",
    "warnings reported by the updated structural summary before finishing.",
    "Frame lines expose title=; set_text with the frame id edits that native title.",
    "Treat tool failures as recoverable feedback. Adjust and continue when safe.",
    "Never claim a canvas edit succeeded until apply_ops confirms it. Finish every",
    "turn with a concise natural-language response to the user.",
    "",
    `Current drawing: "${name ?? "Untitled"}"`,
    "",
    summary,
  ].join("\n");

type ToolActivity = {
  id: string;
  name: string;
  status: "running" | "success" | "error";
  message?: string;
};

type BatchActivity = {
  opsBatchId: string;
  version: number;
  revertVersion: number;
  summaryDelta: string[];
  status: "applied";
};

const writeSse = (res: express.Response, event: string, data: unknown) => {
  if (!res.destroyed && !res.writableEnded) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
};

export const executePersistentChatTurn = async (params: {
  req: express.Request;
  res: express.Response;
  deps: RegisterAiRoutesDeps;
  drawing: {
    id: string;
    name: string;
    version: number;
    elements: string;
    appState: string;
  };
  settings: ResolvedAiSettings;
  adapter: AiProviderAdapter;
  userText: string;
  clientRequestId: string;
  canvasImage?: string;
  canvasState: "captured" | "blank" | "unavailable";
  codexAuth?: ChatGptAuth;
  reasoningEffort?: string;
}) => {
  const { req, res, deps, drawing, settings, adapter } = params;
  const drawingId = drawing.id;
  const room = `drawing_${drawingId}`;
  const history = await loadConversationHistory({
    prisma: deps.prisma,
    drawingId,
    providerId: settings.id,
    model: settings.model,
  });
  const stored = await createStoredChatTurn({
    prisma: deps.prisma,
    drawingId,
    userId: req.user!.id,
    text: params.userText,
    clientRequestId: params.clientRequestId,
    providerId: settings.id,
    model: settings.model,
    reasoningEffort: params.reasoningEffort,
  });

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const emitMessage = (message: StoredChatMessageDto) => {
    writeSse(res, "message", message);
    deps.io?.to(room).emit("ai-chat-message", {
      drawingId,
      clientRequestId: params.clientRequestId,
      message,
    });
  };
  emitMessage(stored.user);
  emitMessage(stored.assistant);
  if (!stored.created) {
    writeSse(res, "done", {});
    res.end();
    return;
  }

  const send = (event: string, data: unknown) => {
    writeSse(res, event, data);
    deps.io?.to(room).emit("ai-chat-event", {
      drawingId,
      clientRequestId: params.clientRequestId,
      messageId: stored.assistant.id,
      event,
      data,
    });
  };

  let summary = buildStructuralSummary({
    name: drawing.name,
    version: drawing.version,
    elements: deps.parseJsonField(drawing.elements, []),
    appState: deps.parseJsonField(drawing.appState, {}),
  });
  const turns: ConversationTurn[] = [
    ...history,
    {
      role: "user",
      text: [
        params.userText,
        params.canvasState === "captured"
          ? "[Canvas context: A current canvas image is attached. The structural state in the system context is current.]"
          : params.canvasState === "blank"
            ? "[Canvas context: The canvas is intentionally blank (0 elements). This is valid state, not a capture or vision error.]"
            : "[Canvas context: The image capture is unavailable. Use the current structural state in the system context.]",
      ].join("\n\n"),
      canvasState: params.canvasState,
      ...(params.canvasImage ? { imageDataUrl: params.canvasImage } : {}),
    },
  ];
  let assistantText = "";
  let thinking = "";
  let errorMessage: string | undefined;
  let opErrors: unknown[] = [];
  let status: "complete" | "error" | "interrupted" = "error";
  let providerMetadata: Record<string, unknown> | undefined;
  const tools: ToolActivity[] = [];
  const batches: BatchActivity[] = [];
  let lastCheckpointAt = 0;
  let pendingCheckpoint = Promise.resolve();
  const checkpoint = (force = false) => {
    const now = Date.now();
    if (!force && now - lastCheckpointAt < 1_000) return;
    lastCheckpointAt = now;
    const snapshot = {
      prisma: deps.prisma,
      id: stored.assistant.id,
      text: assistantText,
      thinking,
      tools: structuredClone(tools),
      batches: structuredClone(batches),
    };
    pendingCheckpoint = pendingCheckpoint
      .then(() => checkpointStoredAssistant(snapshot))
      .catch(() => undefined);
  };

  try {
    let completed = false;
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
      const completion = await adapter.complete({
        settings,
        system: buildSystemPrompt(drawing.name, summary),
        turns,
        tools: AGENT_TOOLS,
        codexAuth: params.codexAuth,
        reasoningEffort: params.reasoningEffort,
        onTextDelta: (text) => {
          assistantText += text;
          send("token", { text });
          checkpoint();
        },
        onThinkingDelta: (text) => {
          thinking += text;
          send("thinking", { text });
          checkpoint();
        },
      });
      if (completion.text && !completion.streamedText) {
        assistantText += completion.text;
        send("token", { text: completion.text });
      }
      providerMetadata = completion.assistantMetadata ?? providerMetadata;
      turns.push({
        role: "assistant",
        text: completion.text,
        toolCalls: completion.toolCalls,
        providerMetadata: completion.assistantMetadata,
      });
      if (completion.toolCalls.length === 0) {
        completed = true;
        break;
      }

      const toolResults: ToolResult[] = [];
      for (const call of completion.toolCalls) {
        const activity: ToolActivity = { id: call.id, name: call.name, status: "running" };
        tools.push(activity);
        send("tool_call", { name: call.name, id: call.id });
        checkpoint();
        if (call.name === "view_canvas") {
          const hasImage = Boolean(params.canvasImage);
          const isBlank = params.canvasState === "blank";
          const message = hasImage
            ? "Canvas snapshot was already attached to the user message"
            : isBlank
              ? "Canvas is blank (0 elements)"
              : "Canvas snapshot unavailable";
          Object.assign(activity, {
            status: hasImage || isBlank ? "success" : "error",
            message,
          });
          toolResults.push({
            id: call.id,
            content: hasImage
              ? "The current snapshot was already attached to the user message."
              : isBlank
                ? "The canvas is blank (0 elements). This is valid empty state."
                : "No canvas image is available. Use the structural summary instead.",
          });
          send("tool_result", {
            id: call.id,
            name: call.name,
            ok: hasImage || isBlank,
            message,
          });
          checkpoint(true);
          continue;
        }
        if (call.name !== "apply_ops") {
          const message = `Unknown tool: ${call.name}`;
          Object.assign(activity, { status: "error", message });
          toolResults.push({ id: call.id, content: message });
          send("tool_result", { id: call.id, name: call.name, ok: false, message });
          checkpoint(true);
          continue;
        }
        const batch = await applyOpsBatch(
          deps,
          drawingId,
          req.user!.id,
          (call.input as { ops?: unknown })?.ops ? call.input : { ops: call.input },
        );
        if (batch.ok === false) {
          const message = `Ops rejected: ${JSON.stringify(batch.errors)}`;
          Object.assign(activity, { status: "error", message: "Canvas operations were rejected" });
          opErrors = batch.errors;
          toolResults.push({ id: call.id, content: message });
          send("tool_result", {
            id: call.id,
            name: call.name,
            ok: false,
            message: "Canvas operations were rejected; the agent can revise them",
          });
          checkpoint(true);
          continue;
        }
        summary = batch.summary;
        const applied: BatchActivity = {
          opsBatchId: batch.opsBatchId,
          version: batch.version,
          revertVersion: batch.revertVersion,
          summaryDelta: batch.summaryDelta,
          status: "applied",
        };
        batches.push(applied);
        Object.assign(activity, { status: "success", message: "Canvas operations applied" });
        send("ops_applied", applied);
        toolResults.push({ id: call.id, content: `Applied. New drawing state:\n${batch.summary}` });
        send("tool_result", {
          id: call.id,
          name: call.name,
          ok: true,
          message: "Canvas operations applied",
        });
        checkpoint(true);
      }
      turns.push({ role: "tool_results", results: toolResults });
    }
    if (completed) {
      status = "complete";
    } else {
      errorMessage = "The assistant reached the tool-step limit. Continue in a new message.";
      send("error", { code: "TOOL_LIMIT_REACHED", message: errorMessage });
    }
  } catch (error) {
    if (settings.provider === "chatgpt" && error instanceof AiProviderError && error.status === 401) {
      await flagReconnect(deps.prisma, req.user!.id);
      errorMessage = "Your ChatGPT connection expired — reconnect to continue";
      send("error", { code: "CHATGPT_RECONNECT", message: errorMessage });
    } else {
      errorMessage = error instanceof AiProviderError ? error.message : "AI chat failed";
      send("error", { code: "PROVIDER_ERROR", message: errorMessage });
    }
  }

  checkpoint(true);
  await pendingCheckpoint;
  const finalMessage = await finalizeStoredAssistant({
    prisma: deps.prisma,
    id: stored.assistant.id,
    text: assistantText,
    thinking,
    status,
    tools,
    batches,
    error: errorMessage,
    opErrors,
    providerMetadata,
  });
  emitMessage(finalMessage);
  if (status === "complete") send("done", {});
  res.end();
};
