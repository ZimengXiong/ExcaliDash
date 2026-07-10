import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { PrismaClient } from "../generated/client";
import { AuthModeService } from "../auth/authMode";
import { ACCESS_TOKEN_COOKIE_NAME, parseCookieHeader } from "../auth/cookies";
import { BOOTSTRAP_USER_ID } from "../auth/authMode";
import {
  getDrawingAccess,
  canEditDrawing,
  canViewDrawing,
} from "../authz/sharing";
import {
  removeSocketFromRooms,
  revalidateRoomSockets,
  type PresenceUser,
  type RevalidatableSocket,
  type SocketState,
} from "./socketAccess";

type RegisterSocketHandlersDeps = {
  io: Server;
  prisma: PrismaClient;
  authModeService: AuthModeService;
  jwtSecret: string;
};

export type SocketHandlers = {
  // Re-check access for every socket currently in a drawing's room; used by the
  // sharing routes to kick collaborators the moment their access is revoked.
  revalidateDrawingAccess: (drawingId: string) => Promise<void>;
};

export const registerSocketHandlers = ({
  io,
  prisma,
  authModeService,
  jwtSecret,
}: RegisterSocketHandlersDeps): SocketHandlers => {
  const roomUsers = new Map<string, PresenceUser[]>();

  const getState = (socket: { data: unknown }): SocketState => {
    const data = socket.data as Partial<SocketState>;
    if (!data.access) data.access = new Map();
    if (!data.joinedRooms) data.joinedRooms = new Set();
    if (data.principal === undefined) data.principal = null;
    return data as SocketState;
  };

  const toPresenceName = (value: unknown): string => {
    if (typeof value !== "string") return "User";
    const trimmed = value.trim().slice(0, 120);
    return trimmed.length > 0 ? trimmed : "User";
  };

  const toPresenceInitials = (name: string): string => {
    // Keep consistent with frontend `getInitialsFromName`.
    const trimmed = name.trim();
    if (!trimmed) return "U";
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
  };

  const toPresenceColor = (value: unknown): string => {
    if (typeof value !== "string") return "#4f46e5";
    const trimmed = value.trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) {
      return trimmed;
    }
    return "#4f46e5";
  };

  const getSocketAuthUserId = async (token?: string): Promise<string | null> => {
    const authEnabled = await authModeService.getAuthEnabled();
    if (!authEnabled) {
      return BOOTSTRAP_USER_ID;
    }

    if (!token) return null;

    try {
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
      return user.id;
    } catch {
      return null;
    }
  };

  io.use(async (socket, next) => {
    try {
      const tokenFromAuth = socket.handshake.auth?.token as string | undefined;
      const tokenFromCookie = (() => {
        const cookies = parseCookieHeader(socket.handshake.headers.cookie);
        const value = cookies[ACCESS_TOKEN_COOKIE_NAME];
        return typeof value === "string" && value.trim().length > 0 ? value : undefined;
      })();
      const token = tokenFromAuth || tokenFromCookie;
      const authEnabled = await authModeService.getAuthEnabled();
      const userId = await getSocketAuthUserId(token);
      const state = getState(socket);

      if (userId) {
        state.principal = { kind: "user", userId };
        return next();
      }

      state.principal = null;
      // Google-Docs-style "anyone with the link": allow anonymous sockets and enforce access on join-room
      // using getDrawingAccess (which consults active link-share policies).
      if (authEnabled) return next();

      return next(new Error("Authentication required"));
    } catch {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    const state = getState(socket);
    const principal = state.principal;
    const ACCESS_CACHE_TTL_MS = 1500;

    const getCachedOrFreshAccess = async (
      drawingId: string,
    ): Promise<"view" | "edit" | "owner" | null> => {
      const cached = state.access.get(drawingId);
      const now = Date.now();
      if (cached && now - cached.checkedAtMs < ACCESS_CACHE_TTL_MS) {
        return cached.access;
      }
      const access = await getDrawingAccess({
        prisma,
        principal,
        drawingId,
      });
      if (!canViewDrawing(access)) {
        state.access.delete(drawingId);
        return null;
      }
      const normalized = access === "owner" ? "owner" : access;
      state.access.set(drawingId, { access: normalized, checkedAtMs: now });
      return normalized;
    };

    // Drop this socket's presence from a drawing it can no longer access.
    const dropDrawingAccess = (drawingId: string) => {
      const roomId = `drawing_${drawingId}`;
      const changed = removeSocketFromRooms(roomUsers, [roomId], socket.id);
      for (const changedRoomId of changed) {
        io.to(changedRoomId).emit("presence-update", roomUsers.get(changedRoomId) ?? []);
      }
      state.joinedRooms.delete(roomId);
      socket.leave(roomId);
    };

    socket.on(
      "join-room",
      async (
        {
          drawingId,
          user,
        }: {
          drawingId: string;
          user: Omit<PresenceUser, "socketId" | "isActive">;
        },
        ack?: (payload: { user: Omit<PresenceUser, "socketId" | "isActive"> }) => void,
      ) => {
        try {
          const access = await getCachedOrFreshAccess(drawingId);
          if (!access) {
            socket.emit("error", { message: "You do not have access to this drawing" });
            return;
          }

          const roomId = `drawing_${drawingId}`;
          socket.join(roomId);
          state.joinedRooms.add(roomId);

          let trustedUserId =
            typeof user?.id === "string" && user.id.trim().length > 0
              ? user.id.trim().slice(0, 200)
              : socket.id;
          let trustedName = toPresenceName(user?.name);

          if (!principal) {
            // Never trust client-provided ids for anonymous/share-link sessions; prevent spoofing/collisions.
            trustedUserId = `anon:${socket.id}`.slice(0, 200);
          } else if (principal?.kind === "user" && principal.userId !== BOOTSTRAP_USER_ID) {
            const account = await prisma.user.findUnique({
              where: { id: principal.userId },
              select: { id: true, name: true },
            });
            if (account) {
              trustedUserId = account.id;
              trustedName = toPresenceName(account.name);
            }
          }

          const newUser: PresenceUser = {
            id: trustedUserId,
            name: trustedName,
            initials: toPresenceInitials(trustedName),
            color: toPresenceColor(user?.color),
            socketId: socket.id,
            isActive: true,
          };

          const currentUsers = roomUsers.get(roomId) || [];
          const filteredUsers = currentUsers.filter((u) => u.id !== newUser.id);
          filteredUsers.push(newUser);
          roomUsers.set(roomId, filteredUsers);

          io.to(roomId).emit("presence-update", filteredUsers);
          // Let the client know what the server will use as its canonical presence identity.
          if (typeof ack === "function") {
            ack({
              user: {
                id: newUser.id,
                name: newUser.name,
                initials: newUser.initials,
                color: newUser.color,
              },
            });
          }
        } catch (err) {
          console.error("Error in join-room handler:", err);
          socket.emit("error", { message: "Failed to join room" });
        }
      },
    );

    socket.on("cursor-move", async (data) => {
      const drawingId = typeof data?.drawingId === "string" ? data.drawingId : null;
      if (!drawingId || !state.access.has(drawingId)) {
        return;
      }
      // Re-validate through the TTL cache so revoked collaborators stop
      // broadcasting cursors (rather than trusting the stale join-time grant).
      const access = await getCachedOrFreshAccess(drawingId);
      if (!access) {
        dropDrawingAccess(drawingId);
        return;
      }
      const roomId = `drawing_${drawingId}`;
      // Don't trust client-provided identity fields; use the server-side presence user.
      const users = roomUsers.get(roomId) || [];
      const self = users.find((u) => u.socketId === socket.id);
      if (!self) return;
      socket.volatile.to(roomId).emit("cursor-move", {
        ...data,
        drawingId,
        userId: self.id,
        username: self.name,
        color: self.color,
      });
    });

    socket.on("element-update", async (data) => {
      const drawingId = typeof data?.drawingId === "string" ? data.drawingId : null;
      if (!drawingId || !state.access.has(drawingId)) {
        return;
      }

      // Enforce edit permission for every mutation event.
      const joinedAccess = await getCachedOrFreshAccess(drawingId);
      if (!joinedAccess) {
        dropDrawingAccess(drawingId);
        return;
      }
      if (!canEditDrawing(joinedAccess)) {
        socket.emit("error", { message: "Read-only access: cannot edit this drawing" });
        return;
      }

      const roomId = `drawing_${drawingId}`;
      socket.to(roomId).emit("element-update", data);
    });

    socket.on(
      "user-activity",
      async ({ drawingId, isActive }: { drawingId: string; isActive: boolean }) => {
        if (typeof drawingId !== "string" || !state.access.has(drawingId)) {
          return;
        }
        // Re-validate so revoked collaborators stop broadcasting presence.
        const access = await getCachedOrFreshAccess(drawingId);
        if (!access) {
          dropDrawingAccess(drawingId);
          return;
        }
        const roomId = `drawing_${drawingId}`;
        const users = roomUsers.get(roomId);
        if (users) {
          const user = users.find((u) => u.socketId === socket.id);
          if (user) {
            user.isActive = isActive;
            io.to(roomId).emit("presence-update", users);
          }
        }
      },
    );

    socket.on("disconnect", () => {
      // Only scan the rooms this socket actually joined instead of every room.
      const changed = removeSocketFromRooms(roomUsers, [...state.joinedRooms], socket.id);
      for (const roomId of changed) {
        io.to(roomId).emit("presence-update", roomUsers.get(roomId) ?? []);
      }
      state.joinedRooms.clear();
      state.access.clear();
    });
  });

  const revalidateDrawingAccess = async (drawingId: string): Promise<void> => {
    const roomId = `drawing_${drawingId}`;
    const socketIds = io.sockets.adapter.rooms.get(roomId);
    if (!socketIds || socketIds.size === 0) return;
    const sockets: RevalidatableSocket[] = [];
    for (const socketId of [...socketIds]) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) sockets.push(socket as unknown as RevalidatableSocket);
    }
    await revalidateRoomSockets({
      prisma,
      drawingId,
      roomUsers,
      sockets,
      emitPresence: (rid, users) => io.to(rid).emit("presence-update", users),
    });
  };

  return { revalidateDrawingAccess };
};
