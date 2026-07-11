import type express from "express";
import type { PrismaClient } from "../../generated/client";
import type { AuditLogData } from "../../utils/audit";
import type { ResolvedAiSettings } from "../settings";
import {
  ChatGptOAuthError,
  buildAuthorizeUrl,
  createState,
  exchangeAuthorizationCode,
  generatePkce,
  parseAuthorizationInput,
} from "./oauth";
import {
  consumePendingAuth,
  disconnect,
  getConnectionStatus,
  savePendingAuth,
  saveConnection,
} from "./store";
import { config } from "../../config";

// Session-only OAuth endpoints for the ChatGPT (subscription) provider. Each
// user connects their own account; tokens are stored per-user, encrypted, and
// never returned to the browser. CSRF is enforced by the global middleware
// (these are non-safe methods outside /auth/*); the OAuth callback is
// additionally protected by a `state` value tied to the initiating user.

export type RegisterChatGptRoutesDeps = {
  app: express.Express;
  prisma: PrismaClient;
  requireAuth: express.RequestHandler;
  asyncHandler: (
    fn: (req: express.Request, res: express.Response, next: express.NextFunction) => unknown,
  ) => express.RequestHandler;
  logAuditEvent: (event: AuditLogData) => Promise<void>;
  loadAiSettings: () => Promise<ResolvedAiSettings>;
};

const requireSessionUser = (
  req: express.Request,
  res: express.Response,
): { id: string } | null => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  if (req.user.authCredentialType === "apiKey") {
    res.status(403).json({ error: "Forbidden", message: "Session auth required" });
    return null;
  }
  return { id: req.user.id };
};

export const registerChatGptRoutes = (deps: RegisterChatGptRoutesDeps): void => {
  const { app, prisma, requireAuth, asyncHandler, logAuditEvent, loadAiSettings } = deps;

  // GET /ai/chatgpt/status — per-user connection state + provider availability.
  app.get(
    "/ai/chatgpt/status",
    requireAuth,
    asyncHandler(async (req, res) => {
      const user = requireSessionUser(req, res);
      if (!user) return;
      const settings = await loadAiSettings();
      const connection = await getConnectionStatus(prisma, user.id);
      res.json({
        enabled: settings.chatgptEnabled,
        isActiveProvider: settings.provider === "chatgpt",
        models: config.ai.chatgpt.models,
        redirectUri: config.ai.chatgpt.redirectUri,
        ...connection,
      });
    }),
  );

  // POST /ai/chatgpt/connect — begin OAuth; returns the URL the user opens.
  app.post(
    "/ai/chatgpt/connect",
    requireAuth,
    asyncHandler(async (req, res) => {
      const user = requireSessionUser(req, res);
      if (!user) return;
      const settings = await loadAiSettings();
      if (!settings.chatgptEnabled) {
        return res.status(403).json({
          error: "Forbidden",
          message: "The ChatGPT subscription provider is disabled",
        });
      }
      const pkce = generatePkce();
      const state = createState();
      await savePendingAuth(prisma, {
        state,
        userId: user.id,
        codeVerifier: pkce.verifier,
      });
      res.json({
        authorizeUrl: buildAuthorizeUrl({ pkce, state }),
        redirectUri: config.ai.chatgpt.redirectUri,
      });
    }),
  );

  // POST /ai/chatgpt/callback — finish OAuth from the pasted redirect URL.
  app.post(
    "/ai/chatgpt/callback",
    requireAuth,
    asyncHandler(async (req, res) => {
      const user = requireSessionUser(req, res);
      if (!user) return;
      const body = req.body ?? {};
      const rawInput =
        typeof body.redirectUrl === "string"
          ? body.redirectUrl
          : typeof body.code === "string"
            ? body.code
            : "";
      const parsedInput = parseAuthorizationInput(rawInput);
      const code = parsedInput.code;
      const state =
        parsedInput.state ?? (typeof body.state === "string" ? body.state : undefined);
      if (!code || !state) {
        return res.status(400).json({
          error: "Bad request",
          message: "A code and state are required (paste the full redirect URL)",
        });
      }

      const pending = await consumePendingAuth(prisma, state);
      if (!pending || pending.userId !== user.id) {
        return res.status(400).json({
          error: "Bad request",
          message: "Authorization state is invalid or expired; start the connection again",
        });
      }

      try {
        const tokens = await exchangeAuthorizationCode({
          code,
          codeVerifier: pending.codeVerifier,
        });
        await saveConnection(prisma, user.id, tokens);
        await logAuditEvent({
          userId: user.id,
          action: "chatgpt_connected",
          resource: `user:${user.id}`,
          details: { accountId: tokens.accountId, plan: tokens.planType },
        });
        res.json(await getConnectionStatus(prisma, user.id));
      } catch (error) {
        const message =
          error instanceof ChatGptOAuthError
            ? error.message
            : "Failed to complete ChatGPT sign-in";
        res.status(400).json({ error: "OAuth failed", message });
      }
    }),
  );

  // POST /ai/chatgpt/disconnect — revoke the stored connection for this user.
  app.post(
    "/ai/chatgpt/disconnect",
    requireAuth,
    asyncHandler(async (req, res) => {
      const user = requireSessionUser(req, res);
      if (!user) return;
      await disconnect(prisma, user.id);
      await logAuditEvent({
        userId: user.id,
        action: "chatgpt_disconnected",
        resource: `user:${user.id}`,
      });
      res.json({ ok: true });
    }),
  );
};
