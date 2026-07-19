import express from "express";
import {
  canEditDrawing,
  canViewDrawing,
  getDrawingAccess,
} from "../authz/sharing";
import type { RegisterAiRoutesDeps } from "./applyOpsBatch";
import {
  interruptStaleChatMessages,
  loadStoredChatMessages,
} from "./chatPersistence";
import { ensureAiEnabled } from "./featureFlag";

export const registerChatHistoryRoutes = (
  app: express.Express,
  deps: RegisterAiRoutesDeps,
) => {
  app.get(
    "/ai/chat/:drawingId/messages",
    deps.requireAuth,
    deps.asyncHandler(async (_req, res, next) => {
      if (await ensureAiEnabled(deps.prisma, res, deps.defaultSystemConfigId)) {
        next();
      }
    }),
    deps.asyncHandler(async (req, res) => {
      if (
        !req.principal ||
        !req.user ||
        req.user.authCredentialType === "apiKey"
      ) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const drawingId = req.params.drawingId;
      const access = await getDrawingAccess({
        prisma: deps.prisma,
        principal: req.principal,
        drawingId,
      });
      if (!canViewDrawing(access)) {
        return res.status(404).json({ error: "Drawing not found" });
      }
      await interruptStaleChatMessages(deps.prisma, drawingId);
      const messages = await loadStoredChatMessages(deps.prisma, drawingId);
      res.json({ messages });
    }),
  );

  app.delete(
    "/ai/chat/:drawingId/messages",
    deps.requireAuth,
    deps.asyncHandler(async (_req, res, next) => {
      if (await ensureAiEnabled(deps.prisma, res, deps.defaultSystemConfigId)) {
        next();
      }
    }),
    deps.asyncHandler(async (req, res) => {
      if (
        !req.principal ||
        !req.user ||
        req.user.authCredentialType === "apiKey"
      ) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const drawingId = req.params.drawingId;
      const access = await getDrawingAccess({
        prisma: deps.prisma,
        principal: req.principal,
        drawingId,
      });
      if (!canEditDrawing(access)) {
        return res.status(404).json({ error: "Drawing not found" });
      }
      const active = await deps.prisma.drawingChatMessage.count({
        where: { drawingId, status: "streaming" },
      });
      if (active > 0) {
        return res.status(409).json({
          error: "Chat is active",
          message: "Stop the active response before clearing chat.",
        });
      }
      await deps.prisma.drawingChatMessage.deleteMany({ where: { drawingId } });
      deps.io?.to(`drawing_${drawingId}`).emit("ai-chat-cleared", {
        drawingId,
      });
      res.status(204).end();
    }),
  );
};
