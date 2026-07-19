import express from "express";
import { canViewDrawing, getDrawingAccess } from "../authz/sharing";
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
};
