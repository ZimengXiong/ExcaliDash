import { Request, Response } from "express";
import { logAuditEvent } from "../utils/audit";
import { apiKeyCreateSchema } from "./schemas";
import {
  DEFAULT_API_KEY_SCOPES,
  generateApiKey,
  parseApiKeyScopes,
  serializeApiKeyScopes,
} from "./apiKeys";
import type { RegisterAccountRoutesDeps } from "./accountRoutes";

const serializeApiKeyMetadata = (apiKey: {
  id: string;
  name: string;
  prefix: string;
  scopes: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: apiKey.id,
  name: apiKey.name,
  prefix: apiKey.prefix,
  scopes: parseApiKeyScopes(apiKey.scopes),
  lastUsedAt: apiKey.lastUsedAt,
  revokedAt: apiKey.revokedAt,
  createdAt: apiKey.createdAt,
  updatedAt: apiKey.updatedAt,
});

const normalizeApiKeyScopes = (
  scopes: string[] | undefined,
): string[] | null => {
  if (!scopes) return [...DEFAULT_API_KEY_SCOPES];
  const allowedScopes = new Set<string>(DEFAULT_API_KEY_SCOPES);
  const normalized = Array.from(
    new Set(scopes.map((scope) => scope.trim()).filter(Boolean)),
  );
  if (
    normalized.length === 0 ||
    normalized.some((scope) => !allowedScopes.has(scope))
  ) {
    return null;
  }
  return normalized;
};

export const registerAccountApiKeyRoutes = (
  deps: RegisterAccountRoutesDeps,
) => {
  const {
    router,
    prisma,
    requireAuth,
    accountActionRateLimiter,
    config,
    requireCsrf,
    sanitizeText,
  } = deps;
  router.get("/api-keys", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({ error: "Unauthorized", message: "User not authenticated" });
      }

      const apiKeys = await prisma.apiKey.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          prefix: true,
          scopes: true,
          lastUsedAt: true,
          revokedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return res.json({ apiKeys: apiKeys.map(serializeApiKeyMetadata) });
    } catch (error) {
      console.error("List API keys error:", error);
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to list API keys",
      });
    }
  });

  router.post(
    "/api-keys",
    requireAuth,
    accountActionRateLimiter,
    async (req: Request, res: Response) => {
      try {
        if (!requireCsrf(req, res)) return;
        if (!req.user) {
          return res
            .status(401)
            .json({ error: "Unauthorized", message: "User not authenticated" });
        }
        if (req.user.impersonatorId) {
          return res.status(403).json({
            error: "Forbidden",
            message: "API key creation is not allowed while impersonating",
          });
        }

        const parsed = apiKeyCreateSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Validation error",
            message: "API key name must be between 1 and 100 characters",
          });
        }

        const scopes = normalizeApiKeyScopes(parsed.data.scopes);
        if (!scopes) {
          return res.status(400).json({
            error: "Validation error",
            message: "Select at least one valid API key scope",
          });
        }

        const generated = generateApiKey();
        const apiKey = await prisma.apiKey.create({
          data: {
            userId: req.user.id,
            name: sanitizeText(parsed.data.name, 100),
            keyId: generated.keyId,
            tokenHash: generated.tokenHash,
            prefix: generated.prefix,
            scopes: serializeApiKeyScopes(scopes),
          },
          select: {
            id: true,
            name: true,
            prefix: true,
            scopes: true,
            lastUsedAt: true,
            revokedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        if (config.enableAuditLogging) {
          await logAuditEvent({
            userId: req.user.id,
            action: "api_key_created",
            resource: `api_key:${apiKey.id}`,
            ipAddress: req.ip || req.connection.remoteAddress || undefined,
            userAgent: req.headers["user-agent"] || undefined,
          });
        }

        return res.status(201).json({
          apiKey: serializeApiKeyMetadata(apiKey),
          token: generated.token,
        });
      } catch (error) {
        console.error("Create API key error:", error);
        return res.status(500).json({
          error: "Internal server error",
          message: "Failed to create API key",
        });
      }
    },
  );

  router.delete(
    "/api-keys/:id",
    requireAuth,
    accountActionRateLimiter,
    async (req: Request, res: Response) => {
      try {
        if (!requireCsrf(req, res)) return;
        if (!req.user) {
          return res
            .status(401)
            .json({ error: "Unauthorized", message: "User not authenticated" });
        }
        if (req.user.impersonatorId) {
          return res.status(403).json({
            error: "Forbidden",
            message: "API key revocation is not allowed while impersonating",
          });
        }

        const apiKey = await prisma.apiKey.findFirst({
          where: { id: req.params.id, userId: req.user.id },
          select: { id: true, revokedAt: true },
        });
        if (!apiKey) {
          return res
            .status(404)
            .json({ error: "Not found", message: "API key not found" });
        }
        if (!apiKey.revokedAt) {
          await prisma.apiKey.update({
            where: { id: apiKey.id },
            data: { revokedAt: new Date() },
          });
        }

        if (config.enableAuditLogging) {
          await logAuditEvent({
            userId: req.user.id,
            action: "api_key_revoked",
            resource: `api_key:${apiKey.id}`,
            ipAddress: req.ip || req.connection.remoteAddress || undefined,
            userAgent: req.headers["user-agent"] || undefined,
          });
        }

        return res.json({ success: true });
      } catch (error) {
        console.error("Revoke API key error:", error);
        return res.status(500).json({
          error: "Internal server error",
          message: "Failed to revoke API key",
        });
      }
    },
  );
};
