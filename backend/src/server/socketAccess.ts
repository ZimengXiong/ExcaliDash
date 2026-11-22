import { PrismaClient } from "../generated/client";
import {
  getDrawingAccessDetails,
  canViewDrawing,
  type DrawingAccessDetails,
  type DrawingPrincipal,
} from "../authz/sharing";
import { revalidateSocketApiKey } from "./socketAuth";

export interface PresenceUser {
  id: string;
  name: string;
  initials: string;
  color: string;
  socketId: string;
  isActive: boolean;
}

// Per-connection state lives on `socket.data` instead of an external
// module-scoped map, so it is garbage-collected with the socket and never
// leaks an entry per failed/short-lived handshake (B5).
export type SocketState = {
  principal: DrawingPrincipal | null;
  // Scopes of the API key the socket authenticated with, or null for JWT,
  // bootstrap and anonymous sockets.
  apiKeyScopes: string[] | null;
  // Id of that API key, so the socket can re-check it for revocation.
  apiKeyId: string | null;
  access: Map<string, DrawingAccessDetails>;
  joinedRooms: Set<string>;
};

// Remove a socket's presence from each of the given rooms, deleting the room
// entry entirely once it is empty (so `roomUsers` never accumulates dead
// rooms). Returns the ids of rooms whose membership actually changed.
export const removeSocketFromRooms = (
  roomUsers: Map<string, PresenceUser[]>,
  roomIds: Iterable<string>,
  socketId: string,
): string[] => {
  const changed: string[] = [];
  for (const roomId of roomIds) {
    const users = roomUsers.get(roomId);
    if (!users) continue;
    const index = users.findIndex((u) => u.socketId === socketId);
    if (index === -1) continue;
    users.splice(index, 1);
    if (users.length === 0) {
      roomUsers.delete(roomId);
    } else {
      roomUsers.set(roomId, users);
    }
    changed.push(roomId);
  }
  return changed;
};

export type RevalidatableSocket = {
  id: string;
  data: Partial<SocketState>;
  emit: (event: string, payload: unknown) => void;
  leave: (roomId: string) => Promise<void> | void;
  disconnect: (close?: boolean) => unknown;
};

const isLinkExpired = (access: DrawingAccessDetails, now: number): boolean =>
  access.linkExpiresAt !== null && access.linkExpiresAt <= now;

const setSocketDrawingAccess = (
  socket: RevalidatableSocket,
  drawingId: string,
  roomUsers: Map<string, PresenceUser[]>,
  details: DrawingAccessDetails | null,
  reason: "revoked" | "expired" | "trashed" | "api-key-revoked",
): boolean => {
  const roomId = `drawing_${drawingId}`;
  if (!socket.data.joinedRooms?.has(roomId)) return false;

  if (details && canViewDrawing(details.access)) {
    const previous = socket.data.access?.get(drawingId)?.access;
    socket.data.access?.set(drawingId, details);
    if (details.access === "view" && previous && previous !== "view") {
      socket.emit("access-changed", { drawingId, accessLevel: "view" });
    }
    return false;
  }

  socket.emit("access-changed", { drawingId, accessLevel: "none", reason });
  socket.data.access?.delete(drawingId);
  socket.data.joinedRooms.delete(roomId);
  void socket.leave(roomId);
  if (reason !== "api-key-revoked") {
    socket.emit("error", {
      message: "Your access to this drawing was revoked",
    });
  }
  return removeSocketFromRooms(roomUsers, [roomId], socket.id).length > 0;
};

export const disconnectInvalidApiKey = (
  socket: RevalidatableSocket,
  roomUsers: Map<string, PresenceUser[]>,
): string[] => {
  const changedRooms: string[] = [];
  for (const roomId of socket.data.joinedRooms ?? []) {
    const drawingId = roomId.slice("drawing_".length);
    if (
      setSocketDrawingAccess(
        socket,
        drawingId,
        roomUsers,
        null,
        "api-key-revoked",
      )
    ) {
      changedRooms.push(roomId);
    }
  }
  socket.emit("error", { message: "API key is no longer valid" });
  socket.disconnect(true);
  return changedRooms;
};

export const pruneExpiredRoomSockets = (
  drawingId: string,
  roomUsers: Map<string, PresenceUser[]>,
  sockets: RevalidatableSocket[],
): boolean => {
  const now = Date.now();
  let presenceChanged = false;
  for (const socket of sockets) {
    const details = socket.data.access?.get(drawingId);
    if (!details || !isLinkExpired(details, now)) continue;
    if (
      setSocketDrawingAccess(
        socket,
        drawingId,
        roomUsers,
        {
          ...details,
          access: details.baseAccess,
          linkExpiresAt: null,
        },
        "expired",
      )
    ) {
      presenceChanged = true;
    }
  }
  return presenceChanged;
};

export const revalidateRoomSockets = async (params: {
  prisma: PrismaClient;
  drawingId: string;
  roomUsers: Map<string, PresenceUser[]>;
  sockets: RevalidatableSocket[];
  isCurrent: () => boolean;
  emitPresence: (roomId: string) => void;
}): Promise<void> => {
  const { prisma, drawingId, roomUsers, sockets, isCurrent, emitPresence } =
    params;
  const accessByUser = new Map<
    string | null,
    Promise<DrawingAccessDetails | null>
  >();
  const scopesByKey = new Map<string, Promise<string[] | null>>();
  const checks = await Promise.all(
    sockets.map(async (socket) => {
      const keyId = socket.data.apiKeyId;
      let scopes: string[] | null = null;
      if (keyId) {
        if (!scopesByKey.has(keyId)) {
          scopesByKey.set(
            keyId,
            revalidateSocketApiKey(prisma, keyId).catch((error) => {
              console.error("Failed to revalidate socket API key:", error);
              return null;
            }),
          );
        }
        scopes = await scopesByKey.get(keyId)!;
        if (!scopes) return { socket, scopes, details: null };
      }
      const principal = socket.data.principal ?? null;
      const userId = principal?.userId ?? null;
      if (!accessByUser.has(userId)) {
        accessByUser.set(
          userId,
          getDrawingAccessDetails({ prisma, principal, drawingId }).catch(
            (error) => {
              console.error(
                "Failed to revalidate drawing socket access:",
                error,
              );
              return null;
            },
          ),
        );
      }
      return { socket, scopes, details: await accessByUser.get(userId)! };
    }),
  );
  if (!isCurrent()) return;

  const changedRooms = new Set<string>();
  const roomId = `drawing_${drawingId}`;
  for (const { socket, scopes, details } of checks) {
    if (!socket.data.joinedRooms?.has(roomId)) continue;
    if (socket.data.apiKeyId && !scopes) {
      for (const changed of disconnectInvalidApiKey(socket, roomUsers)) {
        changedRooms.add(changed);
      }
      continue;
    }
    if (scopes) socket.data.apiKeyScopes = scopes;
    const previous = socket.data.access?.get(drawingId);
    const reason = details?.trashed
      ? "trashed"
      : previous && isLinkExpired(previous, Date.now())
        ? "expired"
        : "revoked";
    if (setSocketDrawingAccess(socket, drawingId, roomUsers, details, reason)) {
      changedRooms.add(roomId);
    }
  }
  if (pruneExpiredRoomSockets(drawingId, roomUsers, sockets))
    changedRooms.add(roomId);
  for (const changed of changedRooms) emitPresence(changed);
};
