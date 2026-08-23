import express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
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
const MAX_CHAT_MESSAGES = 40;
const MAX_CHAT_MESSAGE_CHARS = 20_000;
const MAX_CHAT_TOTAL_CHARS = 100_000;

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
    keyGenerator: (req) =>
      req.user?.id ?? ipKeyGenerator(req.ip ?? "0.0.0.0"),
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
      if (rawMessages.length > MAX_CHAT_MESSAGES) {
        return res.status(400).json({
          error: "Bad request",
          message: `messages must contain at most ${MAX_CHAT_MESSAGES} entries`,
        });
      }
      const messages: { role: "user" | "assistant"; content: string }[] = [];
      let totalMessageChars = 0;
      for (const m of rawMessages) {
        if (m?.role !== "user" && m?.role !== "assistant") {
          return res.status(400).json({
            error: "Bad request",
            message: "Each message role must be user or assistant",
          });
        }
        const role = m.role;
        const content = typeof m?.content === "string" ? m.content : "";
        if (content.length === 0) continue;
        if (content.length > MAX_CHAT_MESSAGE_CHARS) {
          return res.status(400).json({
            error: "Bad request",
            message: `Each message must be at most ${MAX_CHAT_MESSAGE_CHARS} characters`,
          });
        }
        totalMessageChars += content.length;
        if (totalMessageChars > MAX_CHAT_TOTAL_CHARS) {
          return res.status(400).json({
            error: "Bad request",
            message: `Message history must be at most ${MAX_CHAT_TOTAL_CHARS} characters`,
          });
        }
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
      // The request stream closes after its body has been consumed, even while
      // the response (and provider call) is still active. Only cancel when the
      // response connection closes before we finish writing it.
      res.on("close", () => {
        if (!res.writableEnded) abort.abort();
      });

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
        let completed = false;
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

          if (completion.toolCalls.length === 0) {
            completed = true;
            break;
          }

          const toolResults: { id: string; content: string }[] = [];
          for (const call of completion.toolCalls) {
            send("tool_call", { name: call.name, id: call.id });
            if (call.name !== "apply_ops") {
              toolResults.push({ id: call.id, content: `Unknown tool: ${call.name}` });
              continue;
            }
            if (abort.signal.aborted) {
              res.end();
              return;
            }
            const currentAccess = await getDrawingAccess({
              prisma,
              principal: req.principal,
              drawingId,
            });
            if (!canEditDrawing(currentAccess)) {
              send("error", {
                code: "ACCESS_REVOKED",
                message: "Your edit access changed while the assistant was working",
              });
              res.end();
              return;
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
        if (completed) {
          send("done", {});
        } else {
          send("error", {
            code: "TOOL_ITERATION_LIMIT",
            message: "The assistant stopped after too many consecutive tool calls",
          });
        }
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
