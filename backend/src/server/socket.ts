import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { PrismaClient } from "../generated/client";
import { AuthModeService } from "../auth/authMode";
import { ACCESS_TOKEN_COOKIE_NAME, parseCookieHeader } from "../auth/cookies";
import { isAtLeastRole, resolveDrawingAccess } from "./drawingAccess";

interface User {
  id: string;
  name: string;
  initials: string;
  color: string;
  socketId: string;
  isActive: boolean;
}

type RegisterSocketHandlersDeps = {
  io: Server;
  prisma: PrismaClient;
  authModeService: AuthModeService;
  jwtSecret: string;
};

export const registerSocketHandlers = ({
  io,
  prisma,
  authModeService,
  jwtSecret,
}: RegisterSocketHandlersDeps) => {
  const roomUsers = new Map<string, User[]>();
  const socketUserMap = new Map<string, string>();

  const toPresenceName = (value: unknown): string => {
    if (typeof value !== "string") return "User";
    const trimmed = value.trim().slice(0, 120);
    return trimmed.length > 0 ? trimmed : "User";
  };

  const toPresenceInitials = (name: string): string => {
    const words = name
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (words.length === 0) return "U";
    const first = words[0]?.[0] ?? "";
    const second = words.length > 1 ? words[1]?.[0] ?? "" : "";
    const initials = `${first}${second}`.toUpperCase().slice(0, 2);
    return initials.length > 0 ? initials : "U";
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
      return "bootstrap-admin";
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
      const userId = await getSocketAuthUserId(token);

      if (!userId) {
        return next(new Error("Authentication required"));
      }

      socketUserMap.set(socket.id, userId);
      next();
    } catch {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    const authenticatedUserId = socketUserMap.get(socket.id);
    const authorizedDrawingRoles = new Map<string, "owner" | "editor" | "viewer">();

    socket.on(
      "join-room",
      async ({
        drawingId,
        user,
      }: {
        drawingId: string;
        user: Omit<User, "socketId" | "isActive">;
      }) => {
        try {
          if (authenticatedUserId) {
            const drawing = await resolveDrawingAccess({
              prisma,
              drawingId,
              userId: authenticatedUserId,
            });

            if (!drawing) {
              socket.emit("error", { message: "You do not have access to this drawing" });
              return;
            }

            authorizedDrawingRoles.set(drawingId, drawing.role);
          }

          const roomId = `drawing_${drawingId}`;
          socket.join(roomId);

          let trustedUserId =
            typeof user?.id === "string" && user.id.trim().length > 0
              ? user.id.trim().slice(0, 200)
              : socket.id;
          let trustedName = toPresenceName(user?.name);

          if (authenticatedUserId && authenticatedUserId !== "bootstrap-admin") {
            const account = await prisma.user.findUnique({
              where: { id: authenticatedUserId },
              select: { id: true, name: true },
            });
            if (account) {
              trustedUserId = account.id;
              trustedName = toPresenceName(account.name);
            }
          }

          const newUser: User = {
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
        } catch (err) {
          console.error("Error in join-room handler:", err);
          socket.emit("error", { message: "Failed to join room" });
        }
      }
    );

    socket.on("cursor-move", (data) => {
      const drawingId = typeof data?.drawingId === "string" ? data.drawingId : null;
      if (!drawingId || !authorizedDrawingRoles.has(drawingId)) {
        return;
      }
      const roomId = `drawing_${drawingId}`;
      socket.volatile.to(roomId).emit("cursor-move", data);
    });

    socket.on("element-update", (data) => {
      const drawingId = typeof data?.drawingId === "string" ? data.drawingId : null;
      if (!drawingId) {
        return;
      }
      const role = authorizedDrawingRoles.get(drawingId);
      if (!role || !isAtLeastRole(role, "editor")) {
        return;
      }
      const roomId = `drawing_${drawingId}`;
      socket.to(roomId).emit("element-update", data);
    });

    socket.on(
      "user-activity",
      ({ drawingId, isActive }: { drawingId: string; isActive: boolean }) => {
        if (!authorizedDrawingRoles.has(drawingId)) {
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
      }
    );

    socket.on("disconnect", () => {
      socketUserMap.delete(socket.id);
      roomUsers.forEach((users, roomId) => {
        const index = users.findIndex((u) => u.socketId === socket.id);
        if (index !== -1) {
          users.splice(index, 1);
          roomUsers.set(roomId, users);
          io.to(roomId).emit("presence-update", users);
        }
      });
    });
  });
};
