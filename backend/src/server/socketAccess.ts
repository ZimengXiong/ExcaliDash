import { PrismaClient } from "../generated/client";
import {
  getDrawingAccess,
  canViewDrawing,
  type DrawingPrincipal,
} from "../authz/sharing";

export interface PresenceUser {
  id: string;
  name: string;
  initials: string;
  color: string;
  socketId: string;
  isActive: boolean;
}

export type AccessCacheEntry = {
  access: "view" | "edit" | "owner";
  checkedAtMs: number;
};

// Per-connection state lives on `socket.data` instead of an external
// module-scoped map, so it is garbage-collected with the socket and never
// leaks an entry per failed/short-lived handshake (B5).
export type SocketState = {
  principal: DrawingPrincipal | null;
  access: Map<string, AccessCacheEntry>;
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
  disconnect: (close?: boolean) => void;
};

// Re-validate a set of sockets against a drawing's current access policy and
// disconnect any that can no longer view it (revoked share / expired link, B15).
export const revalidateRoomSockets = async (params: {
  prisma: PrismaClient;
  drawingId: string;
  roomUsers: Map<string, PresenceUser[]>;
  sockets: RevalidatableSocket[];
  emitPresence: (roomId: string, users: PresenceUser[]) => void;
}): Promise<void> => {
  const { prisma, drawingId, roomUsers, sockets, emitPresence } = params;
  const roomId = `drawing_${drawingId}`;
  for (const socket of sockets) {
    // Force a fresh check by dropping any cached grant for this drawing.
    socket.data.access?.delete(drawingId);
    const principal = socket.data.principal ?? null;
    const access = await getDrawingAccess({ prisma, principal, drawingId });
    if (!canViewDrawing(access)) {
      const changed = removeSocketFromRooms(roomUsers, [roomId], socket.id);
      for (const changedRoomId of changed) {
        emitPresence(changedRoomId, roomUsers.get(changedRoomId) ?? []);
      }
      socket.data.joinedRooms?.delete(roomId);
      socket.emit("error", {
        message: "Your access to this drawing was revoked",
      });
      socket.disconnect(true);
    } else {
      socket.data.access?.set(drawingId, {
        access: access === "owner" ? "owner" : access,
        checkedAtMs: Date.now(),
      });
    }
  }
};
