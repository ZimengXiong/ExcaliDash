import type express from "express";

export const MAX_TOOL_ITERATIONS = 24;
export const MAX_ACTION_RECOVERIES = 1;
export const REPEATED_TOOL_BATCH_LIMIT = 3;

const CANVAS_MUTATION_REQUEST =
  /\b(draw|add|create|make|place|insert|connect|move|resize|delete|remove|change|update|edit|arrange|layout|align|distribute|color|style|label|write|replace)\b/i;

export const requestsCanvasMutation = (text: string): boolean =>
  CANVAS_MUTATION_REQUEST.test(text);

export const buildSystemPrompt = (
  name: string | null,
  summary: string,
): string =>
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
    "short labels, consistent styles, and edge-bound connectors. Labeled shapes",
    "auto-grow vertically when their wrapped text needs more room. Fix any",
    "warnings (especially overlaps or label-overflow) before finishing.",
    "Frame lines expose title=; set_text with the frame id edits that native title.",
    "Treat tool failures as recoverable feedback. Adjust and continue when safe.",
    "For canvas-edit requests, act early: keep reasoning brief and call apply_ops",
    "before spending time narrating or refining every coordinate in prose.",
    "Never claim a canvas edit succeeded until apply_ops confirms it. Finish every",
    "turn with a concise natural-language response to the user.",
    "",
    `Current drawing: "${name ?? "Untitled"}"`,
    "",
    summary,
  ].join("\n");

export type ToolActivity = {
  id: string;
  name: string;
  status: "running" | "success" | "error";
  message?: string;
};

export type BatchActivity = {
  opsBatchId: string;
  version: number;
  revertVersion: number;
  summaryDelta: string[];
  status: "applied";
};

export const writeSse = (
  res: express.Response,
  event: string,
  data: unknown,
): void => {
  if (!res.destroyed && !res.writableEnded) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
};
