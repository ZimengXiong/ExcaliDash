import { applyOpsBatch, type RegisterAiRoutesDeps } from "./applyOpsBatch";
import type { ToolCall, ToolResult } from "./providers/types";
import type { BatchActivity, ToolActivity } from "./chatTurnSupport";

type ToolExecution = {
  result: ToolResult;
  batch?: BatchActivity;
  summary?: string;
  opErrors?: unknown[];
};

type RunChatToolParams = {
  call: ToolCall;
  activity: ToolActivity;
  deps: RegisterAiRoutesDeps;
  drawingId: string;
  userId: string;
  canvasImage?: string;
  canvasState: "captured" | "blank" | "unavailable";
  send: (event: string, data: unknown) => void;
};

export const runChatTool = async ({
  call,
  activity,
  deps,
  drawingId,
  userId,
  canvasImage,
  canvasState,
  send,
}: RunChatToolParams): Promise<ToolExecution> => {
  if (call.name === "view_canvas") {
    const hasImage = Boolean(canvasImage);
    const isBlank = canvasState === "blank";
    const message = hasImage
      ? "Canvas snapshot was already attached to the user message"
      : isBlank
        ? "Canvas is blank (0 elements)"
        : "Canvas snapshot unavailable";
    Object.assign(activity, {
      status: hasImage || isBlank ? "success" : "error",
      message,
    });
    send("tool_result", {
      id: call.id,
      name: call.name,
      ok: hasImage || isBlank,
      message,
    });
    return {
      result: {
        id: call.id,
        content: hasImage
          ? "The current snapshot was already attached to the user message."
          : isBlank
            ? "The canvas is blank (0 elements). This is valid empty state."
            : "No canvas image is available. Use the structural summary instead.",
      },
    };
  }

  if (call.name !== "apply_ops") {
    const message = `Unknown tool: ${call.name}`;
    Object.assign(activity, { status: "error", message });
    send("tool_result", {
      id: call.id,
      name: call.name,
      ok: false,
      message,
    });
    return { result: { id: call.id, content: message } };
  }

  const batch = await applyOpsBatch(
    deps,
    drawingId,
    userId,
    (call.input as { ops?: unknown })?.ops ? call.input : { ops: call.input },
  );
  if (batch.ok === false) {
    Object.assign(activity, {
      status: "error",
      message: "Canvas operations were rejected",
    });
    send("tool_result", {
      id: call.id,
      name: call.name,
      ok: false,
      message: "Canvas operations were rejected; the agent can revise them",
    });
    return {
      result: {
        id: call.id,
        content: `Ops rejected: ${JSON.stringify(batch.errors)}`,
      },
      opErrors: batch.errors,
    };
  }

  const applied: BatchActivity = {
    opsBatchId: batch.opsBatchId,
    version: batch.version,
    revertVersion: batch.revertVersion,
    summaryDelta: batch.summaryDelta,
    status: "applied",
  };
  Object.assign(activity, {
    status: "success",
    message: "Canvas operations applied",
  });
  send("ops_applied", applied);
  send("tool_result", {
    id: call.id,
    name: call.name,
    ok: true,
    message: "Canvas operations applied",
  });
  return {
    result: {
      id: call.id,
      content: `Applied. New drawing state:\n${batch.summary}`,
    },
    batch: applied,
    summary: batch.summary,
  };
};
