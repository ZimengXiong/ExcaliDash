import jwt from "jsonwebtoken";
import { PrismaClient } from "../generated/client";
import { AuthModeService, BOOTSTRAP_USER_ID } from "../auth/authMode";
import { authenticateApiKey, isApiKeyToken } from "../auth/apiKeys";

export type SocketAuth = {
  userId: string;
  // Set only for API key connections; JWT and bootstrap sessions are not
  // limited by scopes.
  apiKeyScopes: string[] | null;
};

type SocketAuthDeps = {
  prisma: PrismaClient;
  authModeService: AuthModeService;
  jwtSecret: string;
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
    // Same rules as the HTTP middleware: legacy drawing-scoped keys never get
    // account access, and a key cannot be used before a forced password reset.
    if (result.drawingId) return null;
    if (result.user.mustResetPassword) return null;
    // Joining a room reads the drawing; writes are checked per event.
    if (!result.scopes.includes("drawings:read")) return null;
    return { userId: result.user.id, apiKeyScopes: result.scopes };
  };

  return async (token?: string): Promise<SocketAuth | null> => {
    const authEnabled = await authModeService.getAuthEnabled();
    if (!authEnabled) {
      return { userId: BOOTSTRAP_USER_ID, apiKeyScopes: null };
    }

    if (!token) return null;

    try {
      if (isApiKeyToken(token)) {
        return await resolveApiKey(token);
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
      return { userId: user.id, apiKeyScopes: null };
    } catch {
      return null;
    }
  };
};
