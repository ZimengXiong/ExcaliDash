import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  canViewDrawing,
  getDrawingAccess,
  isOwnerAccess,
} from "../../authz/sharing";
import {
  AGENT_TOKEN_SCOPES,
  generateApiKey,
  serializeApiKeyScopes,
} from "../../auth/apiKeys";
import type { DrawingRouteContext } from "./drawingRouteContext";

const agentTokenCreateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
});

type AgentTokenMetadata = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const serializeAgentToken = (token: AgentTokenMetadata) => ({
  id: token.id,
  name: token.name,
  prefix: token.prefix,
  lastUsedAt: token.lastUsedAt,
  revokedAt: token.revokedAt,
  createdAt: token.createdAt,
  updatedAt: token.updatedAt,
});

const agentTokenSelect = {
  id: true,
  name: true,
  prefix: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Per-drawing agent tokens: owner-only bearer credentials confined by the auth
// middleware to a single drawing's agent routes (ops/summary/elements). These
// management routes are session-only (CSRF-protected globally); account API
// keys are refused here because the path is not one of the API-key-authorized
// resource routes.
export const registerDrawingAgentTokenRoutes = (
  app: express.Express,
  context: DrawingRouteContext,
) => {
  const { prisma, requireAuth, asyncHandler, sanitizeText, logAuditEvent, config } =
    context;

  const tokenMutationLimiter = rateLimit({
    windowMs: 60000,
    max: 30,
    keyGenerator: (req) => req.user?.id ?? req.ip ?? "anonymous",
    message: {
      error: "Rate limit exceeded",
      message: "Too many agent token changes, please slow down",
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false, xForwardedForHeader: false },
  });

  // Resolve owner access or send the appropriate status. Returns the owner
  // userId on success, null (response already sent) otherwise.
  const requireOwner = async (
    req: express.Request,
    res: express.Response,
    drawingId: string,
  ): Promise<string | null> => {
    if (!req.principal) {
      res.status(401).json({ error: "Unauthorized" });
      return null;
    }
    if (req.user?.impersonatorId) {
      res.status(403).json({
        error: "Forbidden",
        message: "Agent token management is not allowed while impersonating",
      });
      return null;
    }
    const access = await getDrawingAccess({
      prisma,
      principal: req.principal,
      drawingId,
    });
    if (!isOwnerAccess(access)) {
      res
        .status(canViewDrawing(access) ? 403 : 404)
        .json({
          error: canViewDrawing(access) ? "Forbidden" : "Drawing not found",
        });
      return null;
    }
    return req.principal.userId;
  };

  // GET /drawings/:id/agent-tokens — list active agent tokens for the drawing.
  app.get(
    "/drawings/:id/agent-tokens",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const ownerId = await requireOwner(req, res, id);
      if (!ownerId) return;

      const tokens = await prisma.apiKey.findMany({
        where: { userId: ownerId, drawingId: id, revokedAt: null },
        orderBy: { createdAt: "desc" },
        select: agentTokenSelect,
      });
      return res.json({ agentTokens: tokens.map(serializeAgentToken) });
    }),
  );

  // POST /drawings/:id/agent-tokens — mint a new agent token (shown once).
  app.post(
    "/drawings/:id/agent-tokens",
    requireAuth,
    tokenMutationLimiter,
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const ownerId = await requireOwner(req, res, id);
      if (!ownerId) return;

      const parsed = agentTokenCreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation error",
          message: "Agent token name must be between 1 and 100 characters",
        });
      }

      const generated = generateApiKey();
      const token = await prisma.apiKey.create({
        data: {
          userId: ownerId,
          drawingId: id,
          name: sanitizeText(parsed.data.name ?? "Agent token", 100),
          keyId: generated.keyId,
          tokenHash: generated.tokenHash,
          prefix: generated.prefix,
          scopes: serializeApiKeyScopes(AGENT_TOKEN_SCOPES),
        },
        select: agentTokenSelect,
      });

      if (config.enableAuditLogging) {
        await logAuditEvent({
          userId: ownerId,
          action: "agent_token_created",
          resource: `drawing:${id}`,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
          details: { agentTokenId: token.id },
        });
      }

      return res.status(201).json({
        agentToken: serializeAgentToken(token),
        token: generated.token,
      });
    }),
  );

  // DELETE /drawings/:id/agent-tokens/:tokenId — revoke an agent token.
  app.delete(
    "/drawings/:id/agent-tokens/:tokenId",
    requireAuth,
    tokenMutationLimiter,
    asyncHandler(async (req, res) => {
      const { id, tokenId } = req.params;
      const ownerId = await requireOwner(req, res, id);
      if (!ownerId) return;

      const token = await prisma.apiKey.findFirst({
        where: { id: tokenId, userId: ownerId, drawingId: id },
        select: { id: true, revokedAt: true },
      });
      if (!token) {
        return res
          .status(404)
          .json({ error: "Not found", message: "Agent token not found" });
      }
      if (!token.revokedAt) {
        await prisma.apiKey.update({
          where: { id: token.id },
          data: { revokedAt: new Date() },
        });
      }

      if (config.enableAuditLogging) {
        await logAuditEvent({
          userId: ownerId,
          action: "agent_token_revoked",
          resource: `drawing:${id}`,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
          details: { agentTokenId: token.id },
        });
      }

      return res.json({ success: true });
    }),
  );
};
