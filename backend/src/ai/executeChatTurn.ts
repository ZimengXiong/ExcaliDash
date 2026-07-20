import express from "express";
import { buildStructuralSummary } from "../agent/summary";
import type { ResolvedAiSettings } from "./settings";
import { AGENT_TOOLS } from "./toolDefs";
import type { RegisterAiRoutesDeps } from "./applyOpsBatch";
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
import {
  buildSystemPrompt,
  MAX_ACTION_RECOVERIES,
  MAX_TOOL_ITERATIONS,
  REPEATED_TOOL_BATCH_LIMIT,
  requestsCanvasMutation,
  type BatchActivity,
  type ToolActivity,
  writeSse,
} from "./chatTurnSupport";
import { runChatTool } from "./runChatTool";

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
  const generationController = new AbortController();
  const handleDisconnect = () => {
    if (!res.writableEnded) generationController.abort();
  };
  res.once("close", handleDisconnect);
  const throwIfStopped = () => {
    if (generationController.signal.aborted) {
      const error = new Error("Generation stopped");
      error.name = "AbortError";
      throw error;
    }
  };
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
    let stoppedWithError = false;
    let actionRecoveries = 0;
    const recentToolBatchSignatures: string[] = [];
    const canvasMutationRequested = requestsCanvasMutation(params.userText);
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
      throwIfStopped();
      const requireCanvasAction =
        canvasMutationRequested &&
        batches.length === 0 &&
        !tools.some((activity) => activity.name === "apply_ops");
      const completion = await adapter.complete({
        settings,
        system: buildSystemPrompt(drawing.name, summary),
        turns,
        tools: requireCanvasAction
          ? AGENT_TOOLS.filter((tool) => tool.name === "apply_ops")
          : AGENT_TOOLS,
        codexAuth: params.codexAuth,
        signal: generationController.signal,
        reasoningEffort: params.reasoningEffort,
        toolChoice: requireCanvasAction ? "required" : "auto",
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
      throwIfStopped();
      if (completion.text && !completion.streamedText) {
        assistantText += completion.text;
        send("token", { text: completion.text });
      }
      if (completion.assistantMetadata || completion.finishReason) {
        providerMetadata = {
          ...(providerMetadata ?? {}),
          ...(completion.assistantMetadata ?? {}),
          ...(completion.finishReason
            ? { finishReason: completion.finishReason }
            : {}),
        };
      }
      turns.push({
        role: "assistant",
        text: completion.text,
        toolCalls: completion.toolCalls,
        providerMetadata: completion.assistantMetadata,
      });
      if (completion.toolCalls.length > 0) {
        const signature = JSON.stringify(
          completion.toolCalls.map((call) => ({
            name: call.name,
            input: call.input,
          })),
        );
        recentToolBatchSignatures.push(signature);
        if (recentToolBatchSignatures.length > REPEATED_TOOL_BATCH_LIMIT) {
          recentToolBatchSignatures.shift();
        }
        if (
          recentToolBatchSignatures.length === REPEATED_TOOL_BATCH_LIMIT &&
          recentToolBatchSignatures.every((value) => value === signature)
        ) {
          errorMessage =
            "The model repeated the same canvas tool call three times, so the run was stopped.";
          send("error", {
            code: "REPEATED_TOOL_CALL",
            message: errorMessage,
          });
          stoppedWithError = true;
          break;
        }
      } else {
        recentToolBatchSignatures.length = 0;
      }
      if (completion.toolCalls.length === 0) {
        const hasVisibleResponse = assistantText.trim().length > 0;
        const attemptedCanvasAction = tools.some(
          (activity) => activity.name === "apply_ops",
        );
        const needsCanvasAction =
          canvasMutationRequested &&
          batches.length === 0 &&
          !attemptedCanvasAction;
        const stoppedBeforeAnswer =
          !hasVisibleResponse ||
          /^(length|max_tokens|max_output_tokens)$/i.test(
            completion.finishReason ?? "",
          );
        if (
          actionRecoveries < MAX_ACTION_RECOVERIES &&
          (stoppedBeforeAnswer || needsCanvasAction)
        ) {
          actionRecoveries += 1;
          turns.push({
            role: "user",
            text: [
              "Your previous response stopped before completing the task.",
              needsCanvasAction
                ? "Do not restart the analysis. Call apply_ops immediately and create the requested canvas result now."
                : "Continue immediately with the final answer. Keep any further reasoning minimal.",
            ].join(" "),
          });
          continue;
        }
        if (!hasVisibleResponse && batches.length === 0) {
          errorMessage =
            "The model stopped after thinking without producing an answer or canvas change. Try again or increase AI_MAX_TOKENS_PER_REQUEST.";
          send("error", {
            code: "EMPTY_MODEL_RESPONSE",
            message: errorMessage,
            ...(completion.finishReason
              ? { finishReason: completion.finishReason }
              : {}),
          });
          stoppedWithError = true;
          break;
        }
        if (needsCanvasAction) {
          errorMessage =
            "The model replied without applying the requested canvas change. Try again with a different model.";
          send("error", {
            code: "CANVAS_ACTION_MISSING",
            message: errorMessage,
            ...(completion.finishReason
              ? { finishReason: completion.finishReason }
              : {}),
          });
          stoppedWithError = true;
          break;
        }
        completed = true;
        break;
      }

      const toolResults: ToolResult[] = [];
      for (const call of completion.toolCalls) {
        throwIfStopped();
        const activity: ToolActivity = { id: call.id, name: call.name, status: "running" };
        tools.push(activity);
        send("tool_call", { name: call.name, id: call.id });
        checkpoint();
        const execution = await runChatTool({
          call,
          activity,
          deps,
          drawingId,
          userId: req.user!.id,
          canvasImage: params.canvasImage,
          canvasState: params.canvasState,
          send,
        });
        toolResults.push(execution.result);
        if (execution.summary) summary = execution.summary;
        if (execution.batch) batches.push(execution.batch);
        if (execution.opErrors) opErrors = execution.opErrors;
        checkpoint(true);
      }
      turns.push({ role: "tool_results", results: toolResults });
    }
    if (completed) {
      status = "complete";
    } else if (!stoppedWithError) {
      errorMessage = "The assistant reached the tool-step limit. Continue in a new message.";
      send("error", { code: "TOOL_LIMIT_REACHED", message: errorMessage });
    }
  } catch (error) {
    if (generationController.signal.aborted) {
      status = "interrupted";
      errorMessage = "Generation stopped.";
    } else if (settings.provider === "chatgpt" && error instanceof AiProviderError && error.status === 401) {
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
  res.off("close", handleDisconnect);
  res.end();
};
