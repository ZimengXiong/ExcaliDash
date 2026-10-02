import { Request, Response } from "express";
import { logAuditEvent } from "../utils/audit";
import { userPreferencesSchema } from "./schemas";
import type { RegisterAccountRoutesDeps } from "./accountRoutes";

export const registerAccountPreferencesRoutes = (
  deps: RegisterAccountRoutesDeps,
) => {
  const {
    router,
    prisma,
    requireAuth,
    ensureAuthEnabled,
    config,
    requireCsrf,
  } = deps;
  const parseStoredPreferences = (raw: string | null | undefined) => {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      const validated = userPreferencesSchema.safeParse(parsed);
      return validated.success ? validated.data : {};
    } catch {
      return {};
    }
  };

  router.get(
    "/preferences",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        if (!(await ensureAuthEnabled(res))) return;
        if (!req.user) {
          return res
            .status(401)
            .json({ error: "Unauthorized", message: "User not authenticated" });
        }

        const user = await prisma.user.findUnique({
          where: { id: req.user.id },
          select: { preferences: true },
        });
        if (!user) {
          return res
            .status(404)
            .json({ error: "Not found", message: "User not found" });
        }

        return res.json({
          preferences: parseStoredPreferences(user.preferences),
        });
      } catch (error) {
        console.error("Get preferences error:", error);
        return res.status(500).json({
          error: "Internal server error",
          message: "Failed to load preferences",
        });
      }
    },
  );

  router.put(
    "/preferences",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        if (!(await ensureAuthEnabled(res))) return;
        if (!requireCsrf(req, res)) return;
        if (!req.user) {
          return res
            .status(401)
            .json({ error: "Unauthorized", message: "User not authenticated" });
        }
        if (req.user.impersonatorId) {
          return res.status(403).json({
            error: "Forbidden",
            message: "Preference updates are not allowed while impersonating",
          });
        }

        const parsed = userPreferencesSchema.partial().safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: "Validation error",
            message: "Invalid preferences",
          });
        }

        const existing = await prisma.user.findUnique({
          where: { id: req.user.id },
          select: { preferences: true },
        });
        if (!existing) {
          return res
            .status(404)
            .json({ error: "Not found", message: "User not found" });
        }

        const preferences = {
          ...parseStoredPreferences(existing.preferences),
          ...parsed.data,
        };
        await prisma.user.update({
          where: { id: req.user.id },
          data: { preferences: JSON.stringify(preferences) },
        });

        if (config.enableAuditLogging) {
          await logAuditEvent({
            userId: req.user.id,
            action: "preferences_updated",
            ipAddress: req.ip || req.connection.remoteAddress || undefined,
            userAgent: req.headers["user-agent"] || undefined,
            details: { fields: Object.keys(parsed.data) },
          });
        }

        return res.json({ preferences });
      } catch (error) {
        console.error("Update preferences error:", error);
        return res.status(500).json({
          error: "Internal server error",
          message: "Failed to save preferences",
        });
      }
    },
  );
};
