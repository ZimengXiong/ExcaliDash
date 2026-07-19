import express from "express";
import { v4 as uuidv4 } from "uuid";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import {
  canEditDrawing,
  canViewDrawing,
  getDrawingAccess,
} from "../authz/sharing";
import { config } from "../config";
import {
  resolveAiRegistry,
  resolveAiSettings,
  toAiStatus,
  type AiSystemConfigRow,
} from "./settings";
import { anthropicAdapter } from "./providers/anthropic";
import { openaiAdapter } from "./providers/openai";
import { opencodeGoAdapter } from "./providers/opencodeGo";
import { codexAdapter } from "./providers/codex";
import { ensureFreshAuth, type ChatGptAuth } from "./chatgpt/store";
import { fetchChatGptModels } from "./chatgpt/models";
import { registerChatGptRoutes } from "./chatgpt/routes";
import type { RegisterAiRoutesDeps } from "./applyOpsBatch";
import type { AiProviderAdapter } from "./providers/types";
import { registerChatHistoryRoutes } from "./chatHistoryRoutes";
import { executePersistentChatTurn } from "./executeChatTurn";
import { ensureAiEnabled } from "./featureFlag";

export type { RegisterAiRoutesDeps } from "./applyOpsBatch";

const MAX_CANVAS_IMAGE_CHARS = 7_000_000;

const parseCanvasImage = (value: unknown): string | undefined => {
  if (typeof value !== "string" || value.length > MAX_CANVAS_IMAGE_CHARS)
    return undefined;
  return /^data:image\/(?:png|jpeg|webp);base64,/.test(value)
    ? value
    : undefined;
};

const parseCanvasState = (
  value: unknown,
  image?: string,
): "captured" | "blank" | "unavailable" => {
  if (image) return "captured";
  if (value === "blank") return "blank";
  return "unavailable";
};

const adapterFor = (provider: string): AiProviderAdapter | null => {
  if (provider === "anthropic") return anthropicAdapter;
  if (provider === "openai" || provider === "gemini" || provider === "custom")
    return openaiAdapter;
  if (provider === "opencode_go") return opencodeGoAdapter;
  if (provider === "chatgpt") return codexAdapter;
  return null;
};

export const registerAiRoutes = (
  app: express.Express,
  deps: RegisterAiRoutesDeps,
) => {
  const { prisma, requireAuth, asyncHandler, defaultSystemConfigId } = deps;

  const loadAiRow = async () =>
    (await prisma.systemConfig.findUnique({
      where: { id: defaultSystemConfigId },
    })) as AiSystemConfigRow | null;
  const loadAiSettings = async (providerId?: string | null) =>
    resolveAiSettings(await loadAiRow(), providerId);
  const requireAiFeatures = asyncHandler(async (_req, res, next) => {
    if (await ensureAiEnabled(prisma, res, defaultSystemConfigId)) next();
  });

  const chatRateLimiter = rateLimit({
    windowMs: config.ai.rateLimitWindowMs,
    max: config.ai.rateLimitMax,
    keyGenerator: (req) =>
      req.user?.id ?? ipKeyGenerator(req.ip ?? "127.0.0.1"),
    message: {
      error: "Rate limit exceeded",
      message: "Too many AI chat requests",
    },
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
  registerChatHistoryRoutes(app, deps);

  // GET /ai/status — availability probe (mirrors the auth-status pattern).
  app.get(
    "/ai/status",
    requireAuth,
    requireAiFeatures,
    asyncHandler(async (_req, res) => {
      res.json(toAiStatus(resolveAiRegistry(await loadAiRow())));
    }),
  );

  // POST /ai/chat — SSE tool loop. Session users with edit access only.
  app.post(
    "/ai/chat",
    requireAuth,
    requireAiFeatures,
    chatRateLimiter,
    asyncHandler(async (req, res) => {
      if (!req.principal || !req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      // Never expose the chat proxy to agent/API-key bearer principals.
      if (req.user.authCredentialType === "apiKey") {
        return res
          .status(403)
          .json({ error: "Forbidden", message: "Session auth required" });
      }

      const body = req.body ?? {};
      const drawingId =
        typeof body.drawingId === "string" ? body.drawingId : "";
      const legacyMessages = Array.isArray(body.messages) ? body.messages : [];
      const legacyUserMessage = [...legacyMessages]
        .reverse()
        .find(
          (message) =>
            message?.role === "user" && typeof message?.content === "string",
        );
      const userText =
        typeof body.message === "string"
          ? body.message.trim()
          : typeof legacyUserMessage?.content === "string"
            ? legacyUserMessage.content.trim()
            : "";
      const clientRequestId =
        typeof body.clientRequestId === "string" &&
        body.clientRequestId.length <= 200
          ? body.clientRequestId
          : uuidv4();
      const canvasImage = parseCanvasImage(body.canvasImage);
      const canvasState = parseCanvasState(body.canvasState, canvasImage);
      if (!drawingId || !userText || userText.length > 50_000) {
        return res.status(400).json({
          error: "Bad request",
          message: "drawingId and message are required",
        });
      }

      const access = await getDrawingAccess({
        prisma,
        principal: req.principal,
        drawingId,
      });
      if (!canEditDrawing(access)) {
        return res.status(canViewDrawing(access) ? 403 : 404).json({
          error: canViewDrawing(access) ? "Forbidden" : "Drawing not found",
        });
      }

      const requestedProviderId =
        typeof body.providerId === "string" ? body.providerId : null;
      const registry = resolveAiRegistry(await loadAiRow());
      if (
        requestedProviderId &&
        !registry.providers.some(
          (profile) => profile.id === requestedProviderId,
        )
      ) {
        return res.status(400).json({
          error: "Bad request",
          message: "Unsupported AI provider",
        });
      }
      let settings = resolveAiSettings(await loadAiRow(), requestedProviderId);
      const requestedModel = typeof body.model === "string" ? body.model : null;
      const requestedReasoningEffort =
        typeof body.reasoningEffort === "string" ? body.reasoningEffort : null;
      const adapter = adapterFor(settings.provider);
      if (!settings.available || !adapter) {
        return res.status(503).json({
          error: "AI unavailable",
          message: "The AI chat proxy is not configured",
        });
      }

      const drawing = await prisma.drawing.findUnique({
        where: { id: drawingId },
      });
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
        const models = await fetchChatGptModels(fresh.auth);
        const selected =
          models.find((model) => model.id === requestedModel) ?? models[0];
        if (!selected) {
          return res.status(503).json({
            error: "AI unavailable",
            message: "No supported ChatGPT models",
          });
        }
        if (
          requestedModel &&
          !models.some((model) => model.id === requestedModel)
        ) {
          return res.status(400).json({
            error: "Bad request",
            message: "Unsupported ChatGPT model",
          });
        }
        if (
          requestedReasoningEffort &&
          !selected.reasoningEfforts.includes(requestedReasoningEffort)
        ) {
          return res.status(400).json({
            error: "Bad request",
            message: "Unsupported reasoning effort",
          });
        }
        settings = { ...settings, model: selected.id };
      } else {
        const selected =
          settings.models.find((model) => model.id === requestedModel) ??
          settings.models[0];
        if (
          requestedModel &&
          !settings.models.some((model) => model.id === requestedModel)
        ) {
          return res.status(400).json({
            error: "Bad request",
            message: "Unsupported model for the selected provider",
          });
        }
        if (
          requestedReasoningEffort &&
          (!selected ||
            !selected.reasoningEfforts.includes(requestedReasoningEffort))
        ) {
          return res.status(400).json({
            error: "Bad request",
            message: "Unsupported reasoning effort for the selected model",
          });
        }
        if (selected) settings = { ...settings, model: selected.id };
      }

      await executePersistentChatTurn({
        req,
        res,
        deps,
        drawing,
        settings,
        adapter,
        userText,
        clientRequestId,
        canvasImage,
        canvasState,
        codexAuth,
        reasoningEffort: requestedReasoningEffort ?? undefined,
      });
    }),
  );
};
