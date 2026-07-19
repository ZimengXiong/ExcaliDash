import type { Request, RequestHandler, Response, Router } from "express";
import {
  discoverProviderModels,
  testProviderConnection,
} from "../ai/providerCatalog";
import { resolveAiRegistry, type AiSystemConfigRow } from "../ai/settings";
import { aiProviderProbeSchema } from "./schemas";

type RegisterAiProviderUtilityRoutesInput = {
  router: Router;
  requireAuth: RequestHandler;
  requireCsrf: (req: Request, res: Response) => boolean;
  requireAdmin: (req: Request, res: Response) => boolean;
  loadAiRow: () => Promise<AiSystemConfigRow | null>;
  ensureEnabled: (res: Response) => Promise<boolean>;
};

export const registerAiProviderUtilityRoutes = ({
  router,
  requireAuth,
  requireCsrf,
  requireAdmin,
  loadAiRow,
  ensureEnabled,
}: RegisterAiProviderUtilityRoutesInput): void => {
  const resolveProbeInput = async (
    body: unknown,
  ): Promise<
    | { ok: true; value: Parameters<typeof discoverProviderModels>[0] }
    | { ok: false }
  > => {
    const parsed = aiProviderProbeSchema.safeParse(body);
    if (!parsed.success) return { ok: false };
    const existing = parsed.data.profileId
      ? resolveAiRegistry(await loadAiRow()).providers.find(
          (profile) => profile.id === parsed.data.profileId,
        )
      : null;
    return {
      ok: true,
      value: {
        provider: parsed.data.provider,
        apiKey: parsed.data.apiKey?.trim() || existing?.apiKey || null,
        baseUrl: parsed.data.baseUrl,
        selectedModel: parsed.data.model,
        refresh: parsed.data.refresh,
      },
    };
  };

  router.post(
    "/ai/providers/models",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        if (!(await ensureEnabled(res))) return;
        if (!requireCsrf(req, res)) return;
        if (!requireAdmin(req, res)) return;
        const input = await resolveProbeInput(req.body);
        if (!input.ok) {
          return void res.status(400).json({
            error: "Bad request",
            message: "Invalid AI provider discovery payload",
          });
        }
        res.json(await discoverProviderModels(input.value));
      } catch (error) {
        console.error("AI model discovery error:", error);
        res.status(500).json({
          error: "Internal server error",
          message: "Failed to discover AI models",
        });
      }
    },
  );

  router.post(
    "/ai/providers/test",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        if (!(await ensureEnabled(res))) return;
        if (!requireCsrf(req, res)) return;
        if (!requireAdmin(req, res)) return;
        const input = await resolveProbeInput(req.body);
        if (!input.ok) {
          return void res.status(400).json({
            error: "Bad request",
            message: "Invalid AI provider test payload",
          });
        }
        res.json(await testProviderConnection(input.value));
      } catch (error) {
        console.error("AI connection test error:", error);
        res.status(500).json({
          error: "Internal server error",
          message: "Failed to test AI provider",
        });
      }
    },
  );
};
