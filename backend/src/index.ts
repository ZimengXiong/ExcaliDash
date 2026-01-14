import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { promises as fsPromises } from "fs";
import { createServer } from "http";
import { Server } from "socket.io";
import { Worker } from "worker_threads";
import multer from "multer";
import archiver from "archiver";
import { z } from "zod";
import { PrismaClient, Prisma } from "./generated/client";
import {
  sanitizeDrawingData,
  validateImportedDrawing,
  sanitizeText,
  sanitizeSvg,
  elementSchema,
  appStateSchema,
  createCsrfToken,
  validateCsrfToken,
  getCsrfTokenHeader,
  getOriginFromReferer,
} from "./security";

dotenv.config();

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

// Helper to get the resolved database file path
const getResolvedDbPath = (): string => {
  const dbUrl = process.env.DATABASE_URL || `file:${defaultDbPath}`;
  if (dbUrl.startsWith("file:")) {
    return dbUrl.replace(/^file:/, "");
  }
  // Fallback to default for non-file URLs (e.g., Postgres)
  return defaultDbPath;
};

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

const uploadDir = path.resolve(__dirname, "../uploads");

const moveFile = async (source: string, destination: string) => {
  try {
    await fsPromises.rename(source, destination);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (!err || err.code !== "EXDEV") {
      throw error;
    }

    await fsPromises
      .unlink(destination)
      .catch((unlinkError: NodeJS.ErrnoException) => {
        if (unlinkError && unlinkError.code !== "ENOENT") {
          throw unlinkError;
        }
      });

    await fsPromises.copyFile(source, destination);
    await fsPromises.unlink(source);
  }
};

const initializeUploadDir = async () => {
  try {
    await fsPromises.mkdir(uploadDir, { recursive: true });
  } catch (error) {
    console.error("Failed to create upload directory:", error);
  }
};

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
const parseJsonField = <T>(
  rawValue: string | null | undefined,
  fallback: T
): T => {
  if (!rawValue) return fallback;
  try {
    return JSON.parse(rawValue) as T;
  } catch (error) {
    console.warn("Failed to parse JSON field", {
      error,
      valuePreview: rawValue.slice(0, 50),
    });
    return fallback;
  }
};

const DRAWINGS_CACHE_TTL_MS = (() => {
  const parsed = Number(process.env.DRAWINGS_CACHE_TTL_MS);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 5_000;
  }
  return parsed;
})();
type DrawingsCacheEntry = { body: Buffer; expiresAt: number };
const drawingsCache = new Map<string, DrawingsCacheEntry>();

const buildDrawingsCacheKey = (keyParts: {
  searchTerm: string;
  collectionFilter: string;
  includeData: boolean;
}) =>
  JSON.stringify([
    keyParts.searchTerm,
    keyParts.collectionFilter,
    keyParts.includeData ? "full" : "summary",
  ]);

const getCachedDrawingsBody = (key: string): Buffer | null => {
  const entry = drawingsCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    drawingsCache.delete(key);
    return null;
  }
  return entry.body;
};

const cacheDrawingsResponse = (key: string, payload: any): Buffer => {
  const body = Buffer.from(JSON.stringify(payload));
  drawingsCache.set(key, {
    body,
    expiresAt: Date.now() + DRAWINGS_CACHE_TTL_MS,
  });
  return body;
};

const invalidateDrawingsCache = () => {
  drawingsCache.clear();
};

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of drawingsCache.entries()) {
    if (now > entry.expiresAt) {
      drawingsCache.delete(key);
    }
  }
}, 60_000).unref();

const PORT = process.env.PORT || 8000;

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "db") {
      const isSqliteDb =
        file.originalname.endsWith(".db") ||
        file.originalname.endsWith(".sqlite");
      if (!isSqliteDb) {
        return cb(new Error("Only .db or .sqlite files are allowed"));
      }
    }
    cb(null, true);
  },
});

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

app.use((req, res, next) => {
  const contentLength = req.headers["content-length"];
  if (contentLength) {
    const sizeInMB = parseInt(contentLength, 10) / 1024 / 1024;
    if (sizeInMB > 10) {
      console.log(
        `[LARGE REQUEST] ${req.method} ${req.path} - ${sizeInMB.toFixed(
          2
        )}MB - Content-Length: ${contentLength} bytes`
      );
    }
  }
  next();
});

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=()"
  );

  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: blob: https:; " +
    "connect-src 'self' ws: wss:; " +
    "frame-ancestors 'none';"
  );

  next();
});

const requestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of requestCounts.entries()) {
    if (now > data.resetTime) {
      requestCounts.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();

const RATE_LIMIT_MAX_REQUESTS = (() => {
  const parsed = Number(process.env.RATE_LIMIT_MAX_REQUESTS);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1000;
  }
  return parsed;
})();

app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const now = Date.now();
  const clientData = requestCounts.get(ip);

  if (!clientData || now > clientData.resetTime) {
    requestCounts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }

  if (clientData.count >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      error: "Rate limit exceeded",
      message: "Too many requests, please try again later",
    });
  }

  clientData.count++;
  next();
});

// CSRF Protection Middleware
// Generates a unique client ID based on IP and User-Agent for token association
const getClientId = (req: express.Request): string => {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const userAgent = req.headers["user-agent"] || "unknown";
  // Create a simple hash for client identification
  // In production, you might use a session ID instead
  return `${ip}:${userAgent}`.slice(0, 256);
};

// Rate limiter specifically for CSRF token generation to prevent store exhaustion
const csrfRateLimit = new Map<string, { count: number; resetTime: number }>();
const CSRF_RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const CSRF_MAX_REQUESTS = (() => {
  const parsed = Number(process.env.CSRF_MAX_REQUESTS);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 60; // 1 per second average
  }
  return parsed;
})();

// CSRF token endpoint - clients should call this to get a token
app.get("/csrf-token", (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const now = Date.now();
  const clientLimit = csrfRateLimit.get(ip);

  if (clientLimit && now < clientLimit.resetTime) {
    if (clientLimit.count >= CSRF_MAX_REQUESTS) {
      return res.status(429).json({
        error: "Rate limit exceeded",
        message: "Too many CSRF token requests",
      });
    }
    clientLimit.count++;
  } else {
    csrfRateLimit.set(ip, { count: 1, resetTime: now + CSRF_RATE_LIMIT_WINDOW });
  }

  // Cleanup old rate limit entries occasionally
  if (Math.random() < 0.01) {
    for (const [key, data] of csrfRateLimit.entries()) {
      if (now > data.resetTime) csrfRateLimit.delete(key);
    }
  }

  const clientId = getClientId(req);
  const token = createCsrfToken(clientId);

  res.json({
    token,
    header: getCsrfTokenHeader()
  });
});

// CSRF validation middleware for state-changing requests
const csrfProtectionMiddleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  // Skip CSRF validation for safe methods (GET, HEAD, OPTIONS)
  // Note: /csrf-token is a GET endpoint, so it's automatically exempt
  const safeMethods = ["GET", "HEAD", "OPTIONS"];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Origin/Referer check for defense in depth
  const origin = req.headers["origin"];
  const referer = req.headers["referer"];

  // If Origin is present, it must match allowed origins
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
    // If no Origin but Referer exists, validate its *origin* (avoid prefix bypass)
    const refererOrigin = getOriginFromReferer(refererValue);
    if (!refererOrigin || !allowedOrigins.includes(refererOrigin)) {
      return res.status(403).json({
        error: "CSRF referer mismatch",
        message: "Referer not allowed",
      });
    }
  }
  // Note: If neither Origin nor Referer is present, we proceed to token check.
  // Some legitimate clients/proxies might strip these, so we don't block strictly on their absence,
  // but relying on the token is the primary defense.

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

// Apply CSRF protection to all routes
app.use(csrfProtectionMiddleware);

const filesFieldSchema = z
  .union([z.record(z.string(), z.any()), z.null()])
  .optional()
  .transform((value) => (value === null ? undefined : value));

const drawingBaseSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  collectionId: z.union([z.string().trim().min(1), z.null()]).optional(),
  preview: z.string().nullable().optional(),
});

const drawingCreateSchema = drawingBaseSchema
  .extend({
    elements: elementSchema.array().default([]),
    appState: appStateSchema.default({}),
    files: filesFieldSchema,
  })
  .refine(
    (data) => {
      try {
        const sanitized = sanitizeDrawingData(data);
        Object.assign(data, sanitized);
        return true;
      } catch (error) {
        console.error("Sanitization failed:", error);
        return false;
      }
    },
    {
      message: "Invalid or malicious drawing data detected",
    }
  );

const drawingUpdateSchema = drawingBaseSchema
  .extend({
    elements: elementSchema.array().optional(),
    appState: appStateSchema.optional(),
    files: filesFieldSchema,
  })
  .refine(
    (data) => {
      try {
        const sanitizedData = { ...data };
        if (data.elements !== undefined || data.appState !== undefined) {
          const fullData = {
            elements: Array.isArray(data.elements) ? data.elements : [],
            appState:
              typeof data.appState === "object" && data.appState !== null
                ? data.appState
                : {},
            files: data.files || {},
            preview: data.preview,
            name: data.name,
            collectionId: data.collectionId,
          };
          const sanitized = sanitizeDrawingData(fullData);
          sanitizedData.elements = sanitized.elements;
          sanitizedData.appState = sanitized.appState;
          if (data.files !== undefined) sanitizedData.files = sanitized.files;
          if (data.preview !== undefined)
            sanitizedData.preview = sanitized.preview;
          Object.assign(data, sanitizedData);
        }
        return true;
      } catch (error) {
        console.error("Sanitization failed:", error);
        if (
          data.elements === undefined &&
          data.appState === undefined &&
          (data.name !== undefined ||
            data.preview !== undefined ||
            data.collectionId !== undefined)
        ) {
          return true;
        }
        return false;
      }
    },
    {
      message: "Invalid or malicious drawing data detected",
    }
  );

const respondWithValidationErrors = (
  res: express.Response,
  issues: z.ZodIssue[]
) => {
  res.status(400).json({
    error: "Invalid drawing payload",
    details: issues,
  });
};

const validateSqliteHeader = (filePath: string): boolean => {
  try {
    const buffer = Buffer.alloc(16);
    const fd = fs.openSync(filePath, "r");
    const bytesRead = fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    if (bytesRead < 16) {
      console.warn("File too small to be a valid SQLite database");
      return false;
    }

    const expectedHeader = Buffer.from([
      0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61,
      0x74, 0x20, 0x33, 0x00,
    ]);

    const isValid = buffer.equals(expectedHeader);
    if (!isValid) {
      console.warn("Invalid SQLite file header detected", {
        filePath,
        header: buffer.toString("hex"),
        expected: expectedHeader.toString("hex"),
      });
    }

    return isValid;
  } catch (error) {
    console.error("Failed to validate SQLite header:", error);
    return false;
  }
};
const verifyDatabaseIntegrityAsync = (filePath: string): Promise<boolean> => {
  if (!validateSqliteHeader(filePath)) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const worker = new Worker(
      path.resolve(__dirname, "./workers/db-verify.js"),
      {
        workerData: { filePath },
      }
    );
    let timeoutHandle: NodeJS.Timeout;
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      resolve(result);
    };

    worker.on("message", (isValid: boolean) => finish(isValid));
    worker.on("error", (err) => {
      console.error("Worker error:", err);
      finish(false);
    });
    worker.on("exit", (code) => {
      if (code !== 0) {
        finish(false);
      }
    });

    timeoutHandle = setTimeout(() => {
      console.warn("Integrity check worker timed out", { filePath });
      worker.terminate();
      finish(false);
    }, 10000);
  });
};

const removeFileIfExists = async (filePath?: string) => {
  if (!filePath) return;
  try {
    await fsPromises.access(filePath).catch(() => {
      return;
    });
    await fsPromises.unlink(filePath);
  } catch (error) {
    console.error("Failed to remove file", { filePath, error });
  }
};

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

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/drawings", async (req, res) => {
  try {
    const { search, collectionId, includeData } = req.query;
    const where: any = {};
    const searchTerm =
      typeof search === "string" && search.trim().length > 0
        ? search.trim()
        : undefined;

    if (searchTerm) {
      where.name = { contains: searchTerm };
    }

    let collectionFilterKey = "default";
    if (collectionId === "null") {
      where.collectionId = null;
      collectionFilterKey = "null";
    } else if (collectionId) {
      const normalizedCollectionId = String(collectionId);
      where.collectionId = normalizedCollectionId;
      collectionFilterKey = `id:${normalizedCollectionId}`;
    } else {
      where.OR = [{ collectionId: { not: "trash" } }, { collectionId: null }];
    }

    const shouldIncludeData =
      typeof includeData === "string"
        ? includeData.toLowerCase() === "true" || includeData === "1"
        : false;

    const cacheKey = buildDrawingsCacheKey({
      searchTerm: searchTerm ?? "",
      collectionFilter: collectionFilterKey,
      includeData: shouldIncludeData,
    });

    const cachedBody = getCachedDrawingsBody(cacheKey);
    if (cachedBody) {
      res.setHeader("X-Cache", "HIT");
      res.setHeader("Content-Type", "application/json");
      return res.send(cachedBody);
    }

    const summarySelect: Prisma.DrawingSelect = {
      id: true,
      name: true,
      collectionId: true,
      preview: true,
      version: true,
      createdAt: true,
      updatedAt: true,
    };

    const queryOptions: Prisma.DrawingFindManyArgs = {
      where,
      orderBy: { updatedAt: "desc" },
    };

    if (!shouldIncludeData) {
      queryOptions.select = summarySelect;
    }

    const drawings = await prisma.drawing.findMany(queryOptions);

    let responsePayload: any = drawings;

    if (shouldIncludeData) {
      responsePayload = drawings.map((d: any) => ({
        ...d,
        elements: parseJsonField(d.elements, []),
        appState: parseJsonField(d.appState, {}),
        files: parseJsonField(d.files, {}),
      }));
    }

    const body = cacheDrawingsResponse(cacheKey, responsePayload);
    res.setHeader("X-Cache", "MISS");
    res.setHeader("Content-Type", "application/json");
    return res.send(body);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch drawings" });
  }
});

app.get("/drawings/:id", async (req, res) => {
  try {
    const { id } = req.params;
    console.log("[API] Fetching drawing", { id });
    const drawing = await prisma.drawing.findUnique({ where: { id } });

    if (!drawing) {
      console.warn("[API] Drawing not found", { id });
      return res.status(404).json({ error: "Drawing not found" });
    }

    res.json({
      ...drawing,
      elements: JSON.parse(drawing.elements),
      appState: JSON.parse(drawing.appState),
      files: JSON.parse(drawing.files || "{}"),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch drawing" });
  }
});

app.post("/drawings", async (req, res) => {
  try {
    const isImportedDrawing = req.headers["x-imported-file"] === "true";

    if (isImportedDrawing && !validateImportedDrawing(req.body)) {
      return res.status(400).json({
        error: "Invalid imported drawing file",
        message:
          "The imported file contains potentially malicious content or invalid structure",
      });
    }

    const parsed = drawingCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return respondWithValidationErrors(res, parsed.error.issues);
    }

    const payload = parsed.data;
    const drawingName = payload.name ?? "Untitled Drawing";
    const targetCollectionId =
      payload.collectionId === undefined ? null : payload.collectionId;

    const newDrawing = await prisma.drawing.create({
      data: {
        name: drawingName,
        elements: JSON.stringify(payload.elements),
        appState: JSON.stringify(payload.appState),
        collectionId: targetCollectionId,
        preview: payload.preview ?? null,
        files: JSON.stringify(payload.files ?? {}),
      },
    });
    invalidateDrawingsCache();

    res.json({
      ...newDrawing,
      elements: JSON.parse(newDrawing.elements),
      appState: JSON.parse(newDrawing.appState),
      files: JSON.parse(newDrawing.files || "{}"),
    });
  } catch (error) {
    console.error("Failed to create drawing:", error);
    res.status(500).json({ error: "Failed to create drawing" });
  }
});

app.put("/drawings/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const parsed = drawingUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      console.error("[API] Validation failed", {
        id,
        errorCount: parsed.error.issues.length,
        errors: parsed.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
          received:
            issue.path.length > 0 ? req.body?.[issue.path.join(".")] : "root",
        })),
      });
      return respondWithValidationErrors(res, parsed.error.issues);
    }

    const payload = parsed.data;

    const data: any = {
      version: { increment: 1 },
    };

    if (payload.name !== undefined) data.name = payload.name;
    if (payload.elements !== undefined)
      data.elements = JSON.stringify(payload.elements);
    if (payload.appState !== undefined)
      data.appState = JSON.stringify(payload.appState);
    if (payload.files !== undefined) data.files = JSON.stringify(payload.files);
    if (payload.collectionId !== undefined)
      data.collectionId = payload.collectionId;
    if (payload.preview !== undefined) data.preview = payload.preview;

    const updatedDrawing = await prisma.drawing.update({
      where: { id },
      data,
    });
    invalidateDrawingsCache();

    res.json({
      ...updatedDrawing,
      elements: JSON.parse(updatedDrawing.elements),
      appState: JSON.parse(updatedDrawing.appState),
      files: JSON.parse(updatedDrawing.files || "{}"),
    });
  } catch (error) {
    console.error("[CRITICAL] Update failed:", error);
    res.status(500).json({ error: "Failed to update drawing" });
  }
});

app.delete("/drawings/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.drawing.delete({ where: { id } });
    invalidateDrawingsCache();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete drawing" });
  }
});

app.post("/drawings/:id/duplicate", async (req, res) => {
  try {
    const { id } = req.params;
    const original = await prisma.drawing.findUnique({ where: { id } });

    if (!original) {
      return res.status(404).json({ error: "Original drawing not found" });
    }

    const newDrawing = await prisma.drawing.create({
      data: {
        name: `${original.name} (Copy)`,
        elements: original.elements,
        appState: original.appState,
        files: original.files,
        collectionId: original.collectionId,
        version: 1,
      },
    });
    invalidateDrawingsCache();

    res.json({
      ...newDrawing,
      elements: JSON.parse(newDrawing.elements),
      appState: JSON.parse(newDrawing.appState),
      files: JSON.parse(newDrawing.files || "{}"),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to duplicate drawing" });
  }
});

app.get("/collections", async (req, res) => {
  try {
    const collections = await prisma.collection.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(collections);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch collections" });
  }
});

app.post("/collections", async (req, res) => {
  try {
    const { name } = req.body;
    const newCollection = await prisma.collection.create({
      data: { name },
    });
    res.json(newCollection);
  } catch (error) {
    res.status(500).json({ error: "Failed to create collection" });
  }
});

app.put("/collections/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const updatedCollection = await prisma.collection.update({
      where: { id },
      data: { name },
    });
    res.json(updatedCollection);
  } catch (error) {
    res.status(500).json({ error: "Failed to update collection" });
  }
});

app.delete("/collections/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.$transaction([
      prisma.drawing.updateMany({
        where: { collectionId: id },
        data: { collectionId: null },
      }),
      prisma.collection.delete({
        where: { id },
      }),
    ]);
    invalidateDrawingsCache();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete collection" });
  }
});

app.get("/library", async (req, res) => {
  try {
    const library = await prisma.library.findUnique({
      where: { id: "default" },
    });

    if (!library) {
      return res.json({ items: [] });
    }

    res.json({
      items: JSON.parse(library.items),
    });
  } catch (error) {
    console.error("Failed to fetch library:", error);
    res.status(500).json({ error: "Failed to fetch library" });
  }
});

app.put("/library", async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: "Items must be an array" });
    }

    const library = await prisma.library.upsert({
      where: { id: "default" },
      update: {
        items: JSON.stringify(items),
      },
      create: {
        id: "default",
        items: JSON.stringify(items),
      },
    });

    res.json({
      items: JSON.parse(library.items),
    });
  } catch (error) {
    console.error("Failed to update library:", error);
    res.status(500).json({ error: "Failed to update library" });
  }
});

app.get("/export", async (req, res) => {
  try {
    const formatParam =
      typeof req.query.format === "string"
        ? req.query.format.toLowerCase()
        : undefined;
    const extension = formatParam === "db" ? "db" : "sqlite";
    const dbPath = getResolvedDbPath();

    try {
      await fsPromises.access(dbPath);
    } catch {
      return res.status(404).json({ error: "Database file not found" });
    }

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="excalidash-db-${new Date().toISOString().split("T")[0]
      }.${extension}"`
    );

    const fileStream = fs.createReadStream(dbPath);
    fileStream.pipe(res);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to export database" });
  }
});

app.get("/export/json", async (req, res) => {
  try {
    const drawings = await prisma.drawing.findMany({
      include: {
        collection: true,
      },
    });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="excalidraw-drawings-${new Date().toISOString().split("T")[0]
      }.zip"`
    );

    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("error", (err) => {
      console.error("Archive error:", err);
      res.status(500).json({ error: "Failed to create archive" });
    });

    archive.pipe(res);

    const drawingsByCollection: { [key: string]: any[] } = {};

    drawings.forEach((drawing: any) => {
      const collectionName = drawing.collection?.name || "Unorganized";
      if (!drawingsByCollection[collectionName]) {
        drawingsByCollection[collectionName] = [];
      }

      const drawingData = {
        elements: JSON.parse(drawing.elements),
        appState: JSON.parse(drawing.appState),
        files: JSON.parse(drawing.files || "{}"),
      };

      drawingsByCollection[collectionName].push({
        name: drawing.name,
        data: drawingData,
      });
    });

    Object.entries(drawingsByCollection).forEach(
      ([collectionName, collectionDrawings]) => {
        const folderName = collectionName.replace(/[<>:"/\\|?*]/g, "_");
        collectionDrawings.forEach((drawing, index) => {
          const fileName = `${drawing.name.replace(
            /[<>:"/\\|?*]/g,
            "_"
          )}.excalidraw`;
          const filePath = `${folderName}/${fileName}`;

          archive.append(JSON.stringify(drawing.data, null, 2), {
            name: filePath,
          });
        });
      }
    );

    const readmeContent = `ExcaliDash Export

This archive contains your ExcaliDash drawings organized by collection folders.

Structure:
- Each collection has its own folder
- Each drawing is saved as a .excalidraw file
- Files can be imported back into ExcaliDash

Export Date: ${new Date().toISOString()}
Total Collections: ${Object.keys(drawingsByCollection).length}
Total Drawings: ${drawings.length}

Collections:
${Object.entries(drawingsByCollection)
        .map(([name, drawings]) => `- ${name}: ${drawings.length} drawings`)
        .join("\n")}
`;

    archive.append(readmeContent, { name: "README.txt" });

    await archive.finalize();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to export drawings" });
  }
});

app.post("/import/sqlite/verify", upload.single("db"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const stagedPath = req.file.path;
    const isValid = await verifyDatabaseIntegrityAsync(stagedPath);
    await removeFileIfExists(stagedPath);

    if (!isValid) {
      return res.status(400).json({ error: "Invalid database format" });
    }

    res.json({ valid: true, message: "Database file is valid" });
  } catch (error) {
    console.error(error);
    if (req.file) {
      await removeFileIfExists(req.file.path);
    }
    res.status(500).json({ error: "Failed to verify database file" });
  }
});

app.post("/import/sqlite", upload.single("db"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const originalPath = req.file.path;
    const stagedPath = path.join(
      uploadDir,
      `temp-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
    );

    try {
      await moveFile(originalPath, stagedPath);
    } catch (error) {
      console.error("Failed to stage uploaded database", error);
      await removeFileIfExists(originalPath);
      await removeFileIfExists(stagedPath);
      return res.status(500).json({ error: "Failed to stage uploaded file" });
    }

    const isValid = await verifyDatabaseIntegrityAsync(stagedPath);
    if (!isValid) {
      await removeFileIfExists(stagedPath);
      return res
        .status(400)
        .json({ error: "Uploaded database failed integrity check" });
    }

    const dbPath = getResolvedDbPath();
    const backupPath = `${dbPath}.backup`;

    try {
      try {
        await fsPromises.access(dbPath);
        await fsPromises.copyFile(dbPath, backupPath);
      } catch { }

      await moveFile(stagedPath, dbPath);
    } catch (error) {
      console.error("Failed to replace database", error);
      await removeFileIfExists(stagedPath);
      return res.status(500).json({ error: "Failed to replace database" });
    }

    await prisma.$disconnect();
    invalidateDrawingsCache();

    res.json({ success: true, message: "Database imported successfully" });
  } catch (error) {
    console.error(error);
    if (req.file) {
      await removeFileIfExists(req.file.path);
    }
    res.status(500).json({ error: "Failed to import database" });
  }
});

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
