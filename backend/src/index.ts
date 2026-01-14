/**
 * ExcaliDash Backend Server
 *
 * Refactored: Routes, middleware, and utilities have been extracted into separate modules
 * to eliminate the "god file" anti-pattern.
 */
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { promises as fsPromises } from "fs";
import { createServer } from "http";
import { Server } from "socket.io";
import { PrismaClient } from "./generated/client";
import {
  createCsrfToken,
  validateCsrfToken,
  getCsrfTokenHeader,
  getOriginFromReferer,
} from "./security";
import {
  createDrawingsRouter,
  createCollectionsRouter,
  createLibraryRouter,
  createExportRouter,
} from "./routes";
import { securityHeadersMiddleware } from "./middleware/securityHeaders";
import { createDefaultRateLimiter, createCsrfRateLimiter } from "./middleware/rateLimiter";
import { startCacheCleanup } from "./utils/cache";

dotenv.config();

// ============================================================================
// Database Configuration
// ============================================================================

const backendRoot = path.resolve(__dirname, "../");
const defaultDbPath = path.resolve(backendRoot, "prisma/dev.db");

const resolveDatabaseUrl = (rawUrl?: string) => {
  if (!rawUrl || rawUrl.trim().length === 0) {
    return `file:${defaultDbPath}`;
  }

  if (!rawUrl.startsWith("file:")) {
    return rawUrl;
  }

  const filePath = rawUrl.replace(/^file:/, "");

  // Prisma treats relative SQLite paths as relative to the schema directory
  // (i.e. `backend/prisma/schema.prisma`). Historically this project used
  // `file:./prisma/dev.db`, which Prisma interprets as `prisma/prisma/dev.db`.
  // To keep runtime and migrations aligned:
  // - Prefer resolving relative paths against `backend/prisma`
  // - But if the path already includes a leading `prisma/`, resolve from repo root
  const prismaDir = path.resolve(backendRoot, "prisma");
  const normalizedRelative = filePath.replace(/^\.\/?/, "");
  const hasLeadingPrismaDir =
    normalizedRelative === "prisma" ||
    normalizedRelative.startsWith("prisma/");

  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(hasLeadingPrismaDir ? backendRoot : prismaDir, normalizedRelative);

  return `file:${absolutePath}`;
};

process.env.DATABASE_URL = resolveDatabaseUrl(process.env.DATABASE_URL);
console.log("Resolved DATABASE_URL:", process.env.DATABASE_URL);

const getResolvedDbPath = (): string => {
  const dbUrl = process.env.DATABASE_URL || `file:${defaultDbPath}`;
  if (dbUrl.startsWith("file:")) {
    return dbUrl.replace(/^file:/, "");
  }
  return defaultDbPath;
};

// ============================================================================
// CORS Configuration
// ============================================================================

const normalizeOrigins = (rawOrigins?: string | null): string[] => {
  const fallback = "http://localhost:6767";
  if (!rawOrigins || rawOrigins.trim().length === 0) {
    return [fallback];
  }

  const ensureProtocol = (origin: string) =>
    /^https?:\/\//i.test(origin) ? origin : `http://${origin}`;

  const removeTrailingSlash = (origin: string) =>
    origin.endsWith("/") ? origin.slice(0, -1) : origin;

  const parsed = rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map(ensureProtocol)
    .map(removeTrailingSlash);

  return parsed.length > 0 ? parsed : [fallback];
};

const allowedOrigins = normalizeOrigins(process.env.FRONTEND_URL);
console.log("Allowed origins:", allowedOrigins);

// ============================================================================
// Server Setup
// ============================================================================

const uploadDir = path.resolve(__dirname, "../uploads");
const PORT = process.env.PORT || 8000;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
  maxHttpBufferSize: 1e8,
});
const prisma = new PrismaClient();

// Initialize upload directory
const initializeUploadDir = async () => {
  try {
    await fsPromises.mkdir(uploadDir, { recursive: true });
  } catch (error) {
    console.error("Failed to create upload directory:", error);
  }
};

// Start cache cleanup
startCacheCleanup();

// ============================================================================
// Middleware
// ============================================================================

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "x-csrf-token"],
    exposedHeaders: ["x-csrf-token"],
  })
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Large request logging
app.use((req, res, next) => {
  const contentLength = req.headers["content-length"];
  if (contentLength) {
    const sizeInMB = parseInt(contentLength, 10) / 1024 / 1024;
    if (sizeInMB > 10) {
      console.log(
        `[LARGE REQUEST] ${req.method} ${req.path} - ${sizeInMB.toFixed(2)}MB`
      );
    }
  }
  next();
});

// Security headers
app.use(securityHeadersMiddleware);

// Rate limiting
const { middleware: rateLimitMiddleware } = createDefaultRateLimiter();
app.use(rateLimitMiddleware);

// ============================================================================
// CSRF Protection
// ============================================================================

const getClientId = (req: express.Request): string => {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const userAgent = req.headers["user-agent"] || "unknown";
  return `${ip}:${userAgent}`.slice(0, 256);
};

const { middleware: csrfRateLimitMiddleware } = createCsrfRateLimiter();

// CSRF token endpoint
app.get("/csrf-token", csrfRateLimitMiddleware, (req, res) => {
  const clientId = getClientId(req);
  const token = createCsrfToken(clientId);

  res.json({
    token,
    header: getCsrfTokenHeader()
  });
});

// CSRF validation middleware
const csrfProtectionMiddleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const safeMethods = ["GET", "HEAD", "OPTIONS"];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  const origin = req.headers["origin"];
  const referer = req.headers["referer"];

  const originValue = Array.isArray(origin) ? origin[0] : origin;
  const refererValue = Array.isArray(referer) ? referer[0] : referer;

  if (originValue) {
    if (!allowedOrigins.includes(originValue)) {
      return res.status(403).json({
        error: "CSRF origin mismatch",
        message: "Origin not allowed",
      });
    }
  } else if (refererValue) {
    const refererOrigin = getOriginFromReferer(refererValue);
    if (!refererOrigin || !allowedOrigins.includes(refererOrigin)) {
      return res.status(403).json({
        error: "CSRF referer mismatch",
        message: "Referer not allowed",
      });
    }
  }

  const clientId = getClientId(req);
  const headerName = getCsrfTokenHeader();
  const tokenHeader = req.headers[headerName];
  const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;

  if (!token) {
    return res.status(403).json({
      error: "CSRF token missing",
      message: `Missing ${headerName} header`,
    });
  }

  if (!validateCsrfToken(clientId, token)) {
    return res.status(403).json({
      error: "CSRF token invalid",
      message: "Invalid or expired CSRF token. Please refresh and try again.",
    });
  }

  next();
};

app.use(csrfProtectionMiddleware);

// ============================================================================
// Routes
// ============================================================================

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/drawings", createDrawingsRouter(prisma));
app.use("/collections", createCollectionsRouter(prisma));
app.use("/library", createLibraryRouter(prisma));
app.use("/export", createExportRouter({ prisma, uploadDir, getResolvedDbPath }));

// Legacy import routes (mounted at root for backwards compatibility)
const exportRouter = createExportRouter({ prisma, uploadDir, getResolvedDbPath });
app.use("/import", exportRouter);

// ============================================================================
// WebSocket (Socket.io) Setup
// ============================================================================

interface User {
  id: string;
  name: string;
  initials: string;
  color: string;
  socketId: string;
  isActive: boolean;
}

const roomUsers = new Map<string, User[]>();

io.on("connection", (socket) => {
  socket.on(
    "join-room",
    ({
      drawingId,
      user,
    }: {
      drawingId: string;
      user: Omit<User, "socketId" | "isActive">;
    }) => {
      const roomId = `drawing_${drawingId}`;
      socket.join(roomId);

      const newUser: User = { ...user, socketId: socket.id, isActive: true };

      const currentUsers = roomUsers.get(roomId) || [];
      const filteredUsers = currentUsers.filter((u) => u.id !== user.id);
      filteredUsers.push(newUser);
      roomUsers.set(roomId, filteredUsers);

      io.to(roomId).emit("presence-update", filteredUsers);
    }
  );

  socket.on("cursor-move", (data) => {
    const roomId = `drawing_${data.drawingId}`;
    socket.volatile.to(roomId).emit("cursor-move", data);
  });

  socket.on("element-update", (data) => {
    const roomId = `drawing_${data.drawingId}`;
    socket.to(roomId).emit("element-update", data);
  });

  socket.on(
    "user-activity",
    ({ drawingId, isActive }: { drawingId: string; isActive: boolean }) => {
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

// ============================================================================
// Server Startup
// ============================================================================

const ensureTrashCollection = async () => {
  try {
    const trash = await prisma.collection.findUnique({
      where: { id: "trash" },
    });
    if (!trash) {
      await prisma.collection.create({
        data: { id: "trash", name: "Trash" },
      });
      console.log("Created Trash collection");
    }
  } catch (error) {
    console.error("Failed to ensure Trash collection:", error);
  }
};

httpServer.listen(PORT, async () => {
  await initializeUploadDir();
  await ensureTrashCollection();
  console.log(`Server running on port ${PORT}`);
});
