import type { PrismaClient } from "../../generated/client";
import { decryptSecret, encryptSecret } from "../crypto";
import {
  ChatGptOAuthError,
  refreshTokens,
  type ChatGptTokens,
} from "./oauth";

// Prisma-backed persistence for the per-user ChatGPT connection and the
// short-lived pending OAuth authorizations. Tokens are encrypted at rest with
// the shared ai/crypto helper and never leave the server.

const PENDING_TTL_MS = 10 * 60 * 1000;
// Refresh a little before the token actually expires to avoid racing a 401.
const REFRESH_SKEW_MS = 60 * 1000;

export type ChatGptAuth = { accessToken: string; accountId: string };

export type ChatGptConnectionStatus = {
  connected: boolean;
  needsReconnect: boolean;
  accountEmail: string | null;
  planType: string | null;
};

export const savePendingAuth = async (
  prisma: PrismaClient,
  params: { state: string; userId: string; codeVerifier: string },
): Promise<void> => {
  // Opportunistically purge stale pending rows for this user.
  await prisma.chatGptAuthState.deleteMany({
    where: {
      userId: params.userId,
      createdAt: { lt: new Date(Date.now() - PENDING_TTL_MS) },
    },
  });
  await prisma.chatGptAuthState.create({
    data: {
      state: params.state,
      userId: params.userId,
      codeVerifier: params.codeVerifier,
    },
  });
};

/** Reads and deletes a pending authorization; null if unknown or expired. */
export const consumePendingAuth = async (
  prisma: PrismaClient,
  state: string,
): Promise<{ userId: string; codeVerifier: string } | null> => {
  const row = await prisma.chatGptAuthState.findUnique({ where: { state } });
  if (!row) return null;
  await prisma.chatGptAuthState.delete({ where: { state } }).catch(() => undefined);
  if (row.createdAt.getTime() < Date.now() - PENDING_TTL_MS) return null;
  return { userId: row.userId, codeVerifier: row.codeVerifier };
};

export const saveConnection = async (
  prisma: PrismaClient,
  userId: string,
  tokens: ChatGptTokens,
): Promise<void> => {
  const data = {
    accountId: tokens.accountId,
    accessTokenEncrypted: encryptSecret(tokens.accessToken),
    refreshTokenEncrypted: encryptSecret(tokens.refreshToken),
    expiresAt: BigInt(Math.floor(tokens.expiresAt)),
    accountEmail: tokens.email,
    planType: tokens.planType,
    needsReconnect: false,
  };
  await prisma.chatGptConnection.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
};

export const disconnect = async (
  prisma: PrismaClient,
  userId: string,
): Promise<void> => {
  await prisma.chatGptConnection
    .delete({ where: { userId } })
    .catch(() => undefined);
  await prisma.chatGptAuthState.deleteMany({ where: { userId } });
};

type ConnectionRow = {
  accountId: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  expiresAt: bigint;
  accountEmail: string | null;
  planType: string | null;
  needsReconnect: boolean;
};

const loadRow = (prisma: PrismaClient, userId: string) =>
  prisma.chatGptConnection.findUnique({
    where: { userId },
  }) as Promise<ConnectionRow | null>;

export const getConnectionStatus = async (
  prisma: PrismaClient,
  userId: string,
): Promise<ChatGptConnectionStatus> => {
  const row = await loadRow(prisma, userId);
  if (!row) {
    return {
      connected: false,
      needsReconnect: false,
      accountEmail: null,
      planType: null,
    };
  }
  return {
    connected: !row.needsReconnect,
    needsReconnect: row.needsReconnect,
    accountEmail: row.accountEmail,
    planType: row.planType,
  };
};

const markReconnect = async (prisma: PrismaClient, userId: string): Promise<void> => {
  await prisma.chatGptConnection
    .update({ where: { userId }, data: { needsReconnect: true } })
    .catch(() => undefined);
};

/** Flags a connection as needing reconnection (e.g. the backend 401'd mid-stream). */
export const flagReconnect = markReconnect;

export type EnsureFreshResult =
  | { ok: true; auth: ChatGptAuth }
  | { ok: false; reason: "not_connected" | "reconnect_required" };

/**
 * Returns usable auth for the user, transparently refreshing the access token
 * when it is near expiry. On a permanent refresh failure the connection is
 * flagged `needsReconnect` and the caller is told to surface a reconnect
 * prompt — API-key providers are unaffected.
 */
export const ensureFreshAuth = async (
  prisma: PrismaClient,
  userId: string,
): Promise<EnsureFreshResult> => {
  const row = await loadRow(prisma, userId);
  if (!row) return { ok: false, reason: "not_connected" };
  if (row.needsReconnect) return { ok: false, reason: "reconnect_required" };

  const accessToken = decryptSecret(row.accessTokenEncrypted);
  const refreshToken = decryptSecret(row.refreshTokenEncrypted);
  if (!refreshToken) {
    await markReconnect(prisma, userId);
    return { ok: false, reason: "reconnect_required" };
  }

  const expiresAt = Number(row.expiresAt);
  if (accessToken && expiresAt - REFRESH_SKEW_MS > Date.now()) {
    return { ok: true, auth: { accessToken, accountId: row.accountId } };
  }

  try {
    const tokens = await refreshTokens(refreshToken);
    await saveConnection(prisma, userId, tokens);
    return {
      ok: true,
      auth: { accessToken: tokens.accessToken, accountId: tokens.accountId },
    };
  } catch (error) {
    if (error instanceof ChatGptOAuthError && error.permanent) {
      await markReconnect(prisma, userId);
      return { ok: false, reason: "reconnect_required" };
    }
    // Transient refresh failure: if the current access token is still valid,
    // keep serving with it rather than forcing a reconnect.
    if (accessToken && expiresAt > Date.now()) {
      return { ok: true, auth: { accessToken, accountId: row.accountId } };
    }
    throw error;
  }
};
