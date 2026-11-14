import jwt from "jsonwebtoken";
import { PrismaClient } from "../generated/client";
import { AuthModeService, BOOTSTRAP_USER_ID } from "../auth/authMode";
import {
  authenticateApiKey,
  isApiKeyToken,
  parseApiKeyScopes,
} from "../auth/apiKeys";

export type SocketAuth = {
  userId: string;
  // Set only for API key connections; JWT and bootstrap sessions are not
  // limited by scopes.
  apiKeyScopes: string[] | null;
  apiKeyId: string | null;
};

type SocketAuthDeps = {
  prisma: PrismaClient;
  authModeService: AuthModeService;
  jwtSecret: string;
};

type ApiKeyRecord = {
  drawingId: string | null;
  user: { isActive: boolean; mustResetPassword: boolean };
};

// Same rules as the HTTP middleware: legacy drawing-scoped keys never get
// account access, and a key cannot be used before a forced password reset.
// Joining a room reads the drawing, so drawings:read is required; writes are
// checked per event.
const isUsableForSockets = (record: ApiKeyRecord, scopes: string[]): boolean =>
  !record.drawingId &&
  record.user.isActive &&
  !record.user.mustResetPassword &&
  scopes.includes("drawings:read");

// Re-checks an already authenticated API key. A socket outlives its handshake,
// so revoking a key (or deactivating its owner) must take effect on open
// sockets too. Returns the key's current scopes, or null if it is no longer
// usable.
export const revalidateSocketApiKey = async (
  prisma: PrismaClient,
  apiKeyId: string,
): Promise<string[] | null> => {
  const apiKey = await prisma.apiKey.findUnique({
    where: { id: apiKeyId },
    select: {
      revokedAt: true,
      scopes: true,
      drawingId: true,
      user: { select: { isActive: true, mustResetPassword: true } },
    },
  });
  if (!apiKey || apiKey.revokedAt) return null;
  const scopes = parseApiKeyScopes(apiKey.scopes);
  return isUsableForSockets(apiKey, scopes) ? scopes : null;
};

// Resolves the credential sent in the Socket.IO handshake to a user. Anything
// that does not resolve leaves the socket anonymous, which still allows link
// shares; join-room enforces access either way.
export const createSocketAuthResolver = ({
  prisma,
  authModeService,
  jwtSecret,
}: SocketAuthDeps) => {
  const resolveApiKey = async (token: string): Promise<SocketAuth | null> => {
    const result = await authenticateApiKey(prisma, token);
    if (!result) return null;
    if (!isUsableForSockets(result, result.scopes)) return null;
    return {
      userId: result.user.id,
      apiKeyScopes: result.scopes,
      apiKeyId: result.id,
    };
  };

  // allowApiKey is false for tokens read from cookies: like REST, API keys are
  // only accepted when sent explicitly, never from ambient browser state.
  return async (
    token?: unknown,
    { allowApiKey = true }: { allowApiKey?: boolean } = {},
  ): Promise<SocketAuth | null> => {
    const authEnabled = await authModeService.getAuthEnabled();
    if (!authEnabled) {
      return { userId: BOOTSTRAP_USER_ID, apiKeyScopes: null, apiKeyId: null };
    }

    if (typeof token !== "string" || !token) return null;

    try {
      if (isApiKeyToken(token)) {
        return allowApiKey ? await resolveApiKey(token) : null;
      }

      const decoded = jwt.verify(token, jwtSecret) as Record<string, unknown>;
      if (
        typeof decoded.userId !== "string" ||
        typeof decoded.email !== "string" ||
        decoded.type !== "access"
      ) {
        return null;
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, isActive: true },
      });

      if (!user || !user.isActive) return null;
      return { userId: user.id, apiKeyScopes: null, apiKeyId: null };
    } catch {
      return null;
    }
  };
};
