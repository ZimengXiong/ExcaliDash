import type { Request, Response } from "express";
import { logAuditEvent } from "../utils/audit";
import type { AiSystemConfigRow } from "../ai/settings";
import type { RegisterAdminRoutesDeps } from "./adminRoutes";
import { aiEnabledToggleSchema } from "./schemas";

export const registerAdminAiFeatureRoutes = (
  deps: RegisterAdminRoutesDeps,
  loadAiRow: () => Promise<AiSystemConfigRow | null>,
) => {
  const {
    router,
    prisma,
    requireAuth,
    requireAdmin,
    requireCsrf,
    defaultSystemConfigId,
    config,
  } = deps;

  router.get(
    "/ai/enabled",
    requireAuth,
    async (_req: Request, res: Response) => {
      try {
        const row = await loadAiRow();
        res.json({ enabled: row?.aiEnabled ?? true });
      } catch (error) {
        console.error("Get AI feature setting error:", error);
        res.status(500).json({
          error: "Internal server error",
          message: "Failed to fetch AI feature setting",
        });
      }
    },
  );

  router.put(
    "/ai/enabled",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        if (!requireCsrf(req, res)) return;
        if (!requireAdmin(req, res)) return;
        const parsed = aiEnabledToggleSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Bad request",
            message: "Invalid AI feature setting payload",
          });
        }
        const updated = await prisma.systemConfig.upsert({
          where: { id: defaultSystemConfigId },
          update: { aiEnabled: parsed.data.enabled },
          create: { id: defaultSystemConfigId, aiEnabled: parsed.data.enabled },
        });
        if (config.enableAuditLogging) {
          await logAuditEvent({
            userId: req.user.id,
            action: "admin_ai_features_toggled",
            resource: "system_config",
            ipAddress: req.ip || req.connection.remoteAddress || undefined,
            userAgent: req.headers["user-agent"] || undefined,
            details: { enabled: updated.aiEnabled },
          });
        }
        res.json({ enabled: updated.aiEnabled });
      } catch (error) {
        console.error("Update AI feature setting error:", error);
        res.status(500).json({
          error: "Internal server error",
          message: "Failed to update AI feature setting",
        });
      }
    },
  );
};
