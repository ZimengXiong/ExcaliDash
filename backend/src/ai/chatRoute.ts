import express from "express";
import rateLimit from "express-rate-limit";
import {
  canEditDrawing,
  canViewDrawing,
  getDrawingAccess,
} from "../authz/sharing";
import { config } from "../config";
import { buildStructuralSummary } from "../agent/summary";
import { resolveAiSettings, toAiStatus, type AiSystemConfigRow } from "./settings";
import { AGENT_TOOLS } from "./toolDefs";
import { anthropicAdapter } from "./providers/anthropic";
import { openaiAdapter } from "./providers/openai";
import { codexAdapter } from "./providers/codex";
import { ensureFreshAuth, flagReconnect, type ChatGptAuth } from "./chatgpt/store";
import { registerChatGptRoutes } from "./chatgpt/routes";
import { applyOpsBatch, type RegisterAiRoutesDeps } from "./applyOpsBatch";
import {
  AiProviderError,
  type AiProviderAdapter,
  type ConversationTurn,
} from "./providers/types";

export type { RegisterAiRoutesDeps } from "./applyOpsBatch";

const MAX_TOOL_ITERATIONS = 8;

const adapterFor = (provider: string): AiProviderAdapter | null => {
  if (provider === "anthropic") return anthropicAdapter;
  if (provider === "openai" || provider === "custom") return openaiAdapter;
  if (provider === "chatgpt") return codexAdapter;
  return null;
};

const buildSystemPrompt = (name: string | null, summary: string): string =>
  [
    "You are an assistant embedded in an Excalidraw drawing editor.",
    "You can read the current canvas from the structural summary below and",
    "modify it by calling the apply_ops tool with a batch of semantic ops.",
    "Element ids in the summary are the ids to reference in ops. After each",
    "apply_ops call you receive an updated summary; keep it in mind.",
    "Only call apply_ops when the user asks for a change; otherwise answer in text.",
    "",
    `Current drawing: "${name ?? "Untitled"}"`,
    "",
    summary,
  ].join("\n");

type SseWriter = (event: string, data: unknown) => void;

export const registerAiRoutes = (
  app: express.Express,
  deps: RegisterAiRoutesDeps,
) => {
  const { prisma, requireAuth, asyncHandler, defaultSystemConfigId } = deps;

  const loadAiSettings = async () => {
    const row = (await prisma.systemConfig.findUnique({
      where: { id: defaultSystemConfigId },
    })) as AiSystemConfigRow | null;
    return resolveAiSettings(row);
  };

  const chatRateLimiter = rateLimit({
    windowMs: config.ai.rateLimitWindowMs,
    max: config.ai.rateLimitMax,
    keyGenerator: (req) => req.user?.id ?? req.ip ?? "anonymous",
    message: { error: "Rate limit exceeded", message: "Too many AI chat requests" },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false, xForwardedForHeader: false },
  });

  registerChatGptRoutes({
    app,
    prisma,
    requireAuth,
    asyncHandler,
    logAuditEvent: deps.logAuditEvent,
    loadAiSettings,
  });

  // GET /ai/status — availability probe (mirrors the auth-status pattern).
  app.get(
    "/ai/status",
    requireAuth,
    asyncHandler(async (_req, res) => {
      const settings = await loadAiSettings();
      res.json(toAiStatus(settings));
    }),
  );

  // POST /ai/chat — SSE tool loop. Session users with edit access only.
  app.post(
    "/ai/chat",
    requireAuth,
    chatRateLimiter,
    asyncHandler(async (req, res) => {
      if (!req.principal || !req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      // Never expose the chat proxy to agent/API-key bearer principals.
      if (req.user.authCredentialType === "apiKey") {
        return res.status(403).json({ error: "Forbidden", message: "Session auth required" });
      }

      const body = req.body ?? {};
      const drawingId = typeof body.drawingId === "string" ? body.drawingId : "";
      const rawMessages = Array.isArray(body.messages) ? body.messages : null;
      if (!drawingId || !rawMessages || rawMessages.length === 0) {
        return res
          .status(400)
          .json({ error: "Bad request", message: "drawingId and messages are required" });
      }
      const messages: { role: "user" | "assistant"; content: string }[] = [];
      for (const m of rawMessages) {
        const role = m?.role === "assistant" ? "assistant" : "user";
        const content = typeof m?.content === "string" ? m.content : "";
        if (content.length === 0) continue;
        messages.push({ role, content });
      }
      if (messages.length === 0) {
        return res.status(400).json({ error: "Bad request", message: "messages are empty" });
      }

      const access = await getDrawingAccess({
        prisma,
        principal: req.principal,
        drawingId,
      });
      if (!canEditDrawing(access)) {
        return res
          .status(canViewDrawing(access) ? 403 : 404)
          .json({ error: canViewDrawing(access) ? "Forbidden" : "Drawing not found" });
      }

      const settings = await loadAiSettings();
      const adapter = adapterFor(settings.provider);
      if (!settings.available || !adapter) {
        return res
          .status(503)
          .json({ error: "AI unavailable", message: "The AI chat proxy is not configured" });
      }

      const drawing = await prisma.drawing.findUnique({ where: { id: drawingId } });
      if (!drawing) return res.status(404).json({ error: "Drawing not found" });

      // For the ChatGPT (subscription) provider, resolve THIS user's tokens and
      // refresh them if needed. A missing/dead connection surfaces a reconnect
      // prompt without touching the API-key providers.
      let codexAuth: ChatGptAuth | undefined;
      if (settings.provider === "chatgpt") {
        const fresh = await ensureFreshAuth(prisma, req.user.id);
        if (fresh.ok === false) {
          return res.status(409).json({
            error: "ChatGPT not connected",
            code: "CHATGPT_RECONNECT",
            message:
              fresh.reason === "not_connected"
                ? "Connect your ChatGPT account to use the assistant"
                : "Your ChatGPT connection expired — reconnect to continue",
          });
        }
        codexAuth = fresh.auth;
      }

      // Switch to SSE.
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
      const send: SseWriter = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      const abort = new AbortController();
      req.on("close", () => abort.abort());

      let summary = buildStructuralSummary({
        name: drawing.name,
        version: drawing.version,
        elements: deps.parseJsonField(drawing.elements, []),
      });

      const turns: ConversationTurn[] = messages.map((m) =>
        m.role === "assistant"
          ? { role: "assistant", text: m.content, toolCalls: [] }
          : { role: "user", text: m.content },
      );

      try {
        for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
          const completion = await adapter.complete({
            settings,
            system: buildSystemPrompt(drawing.name, summary),
            turns,
            tools: AGENT_TOOLS,
            signal: abort.signal,
            codexAuth,
          });

          if (completion.text) send("token", { text: completion.text });
          turns.push({
            role: "assistant",
            text: completion.text,
            toolCalls: completion.toolCalls,
          });

          if (completion.toolCalls.length === 0) break;

          const toolResults: { id: string; content: string }[] = [];
          for (const call of completion.toolCalls) {
            send("tool_call", { name: call.name, id: call.id });
            if (call.name !== "apply_ops") {
              toolResults.push({ id: call.id, content: `Unknown tool: ${call.name}` });
              continue;
            }
            const batch = await applyOpsBatch(
              deps,
              drawingId,
              req.user.id,
              (call.input as { ops?: unknown })?.ops
                ? call.input
                : { ops: call.input },
            );
            if (batch.ok === false) {
              send("error", { code: "OPS_VALIDATION_FAILED", errors: batch.errors });
              toolResults.push({
                id: call.id,
                content: `Ops rejected: ${JSON.stringify(batch.errors)}`,
              });
              continue;
            }
            summary = batch.summary;
            send("ops_applied", {
              opsBatchId: batch.opsBatchId,
              version: batch.version,
              revertVersion: batch.revertVersion,
              summaryDelta: batch.summaryDelta,
            });
            toolResults.push({
              id: call.id,
              content: `Applied. New drawing state:\n${batch.summary}`,
            });
          }
          turns.push({ role: "tool_results", results: toolResults });
        }
        send("done", {});
      } catch (error) {
        if (abort.signal.aborted) {
          res.end();
          return;
        }
        // A 401 from the Codex backend after a fresh token means OpenAI stopped
        // accepting this connection: flag it so the panel prompts a reconnect
        // and other providers keep working.
        if (
          settings.provider === "chatgpt" &&
          error instanceof AiProviderError &&
          error.status === 401
        ) {
          await flagReconnect(prisma, req.user.id);
          send("error", {
            code: "CHATGPT_RECONNECT",
            message: "Your ChatGPT connection expired — reconnect to continue",
          });
        } else {
          const message =
            error instanceof AiProviderError ? error.message : "AI chat failed";
          send("error", { code: "PROVIDER_ERROR", message });
        }
      }
      res.end();
    }),
  );
};
