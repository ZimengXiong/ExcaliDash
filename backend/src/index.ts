import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { promises as fsPromises } from "fs";
import { createServer } from "http";
import { Server } from "socket.io";
import { Worker } from "worker_threads";
import multer from "multer";
import { z } from "zod";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { v4 as uuidv4 } from "uuid";
import { PrismaClient, Prisma } from "./generated/client";
import {
  sanitizeDrawingData,
  validateImportedDrawing,
  sanitizeText,
  sanitizeSvg,
  elementSchema,
  appStateSchema,
} from "./security";
import { config } from "./config";
import { authModeService, requireAuth } from "./middleware/auth";
import { errorHandler, asyncHandler } from "./middleware/errorHandler";
import authRouter from "./auth";
import { logAuditEvent } from "./utils/audit";
import { registerDashboardRoutes } from "./routes/dashboard";
import { registerImportExportRoutes } from "./routes/importExport";
import { prisma } from "./db/prisma";
import { createDrawingsCacheStore } from "./server/drawingsCache";
import { registerCsrfProtection } from "./server/csrf";
import { registerSocketHandlers } from "./server/socket";
import { getClientIp } from "./utils/clientIp";

const backendRoot = path.resolve(__dirname, "../");
console.log("Resolved DATABASE_URL:", process.env.DATABASE_URL);

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

const allowedOrigins = normalizeOrigins(config.frontendUrl);
console.log("Allowed origins:", allowedOrigins);
console.log("API base path:", config.apiBasePath);

const isDev = (process.env.NODE_ENV || "development") !== "production";
const isLocalDevOrigin = (origin: string): boolean => {
  // Allow any localhost/127.0.0.1 port in dev (Vite often picks a free port).
  return (
    /^http:\/\/localhost:\d+$/i.test(origin) ||
    /^http:\/\/127\.0\.0\.1:\d+$/i.test(origin)
  );
};

const isAllowedOrigin = (origin?: string): boolean => {
  if (!origin) return true; // non-browser clients / same-origin
  if (allowedOrigins.includes(origin)) return true;
  if (isDev && isLocalDevOrigin(origin)) return true;
  return false;
};

const uploadDir = path.resolve(__dirname, "../uploads");
const MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024;
const MAX_PAGE_SIZE = 200;
const MAX_IMPORT_ARCHIVE_ENTRIES = 6000;
const MAX_IMPORT_COLLECTIONS = 1000;
const MAX_IMPORT_DRAWINGS = 5000;
const MAX_IMPORT_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_DRAWING_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_TOTAL_EXTRACTED_BYTES = 120 * 1024 * 1024;

let cachedBackendVersion: string | null = null;
const getBackendVersion = (): string => {
  if (cachedBackendVersion) return cachedBackendVersion;
  try {
    const raw = fs.readFileSync(path.resolve(backendRoot, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    cachedBackendVersion = typeof parsed.version === "string" ? parsed.version : "unknown";
  } catch {
    cachedBackendVersion = "unknown";
  }
  return cachedBackendVersion;
};

const initializeUploadDir = async () => {
  try {
    await fsPromises.mkdir(uploadDir, { recursive: true });
  } catch (error) {
    console.error("Failed to create upload directory:", error);
  }
};

const app = express();

// Trust proxy headers (X-Forwarded-For, X-Real-IP) only when explicitly configured.
// Safe default is disabled to avoid spoofed client IPs when running without a trusted proxy.
// Set TRUST_PROXY=1 (or a specific hop count) when deploying behind reverse proxies.
const trustProxyConfig = (process.env.TRUST_PROXY ?? "false").trim();
const parsedProxyHops = Number.parseInt(trustProxyConfig, 10);
const trustProxyValue =
  trustProxyConfig === "true"
    ? true
    : trustProxyConfig === "false"
    ? false
    : Number.isFinite(parsedProxyHops) && parsedProxyHops > 0
    ? parsedProxyHops
    : false;
app.set("trust proxy", trustProxyValue);

if (trustProxyValue === true) {
  console.log("[config] trust proxy: enabled (handles multiple proxy layers)");
} else {
  console.log(`[config] trust proxy: ${trustProxyValue}`);
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  path:
    config.apiBasePath === "/"
      ? "/socket.io"
      : `${config.apiBasePath}/socket.io`,
  cors: {
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin ?? undefined)),
    credentials: true,
  },
  maxHttpBufferSize: 1e8,
});
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
const {
  buildDrawingsCacheKey,
  getCachedDrawingsBody,
  cacheDrawingsResponse,
  invalidateDrawingsCache,
} = createDrawingsCacheStore(DRAWINGS_CACHE_TTL_MS);

const getUserTrashCollectionId = (userId: string): string => `trash:${userId}`;

const ensureTrashCollection = async (
  db: Prisma.TransactionClient | PrismaClient,
  userId: string
): Promise<void> => {
  const trashCollectionId = getUserTrashCollectionId(userId);
  const trashCollection = await db.collection.findFirst({
    where: { id: trashCollectionId, userId },
  });

  if (!trashCollection) {
    await db.collection.create({
      data: {
        id: trashCollectionId,
        name: "Trash",
        userId,
      },
    });
  }

  // Legacy migration: move this user's drawings off global "trash".
  await db.drawing.updateMany({
    where: { userId, collectionId: "trash" },
    data: { collectionId: trashCollectionId },
  });
};

const PORT = config.port;

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES,
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

// Request ID middleware (must be early in the chain)
app.use((req, res, next) => {
  const requestId = uuidv4();
  req.headers["x-request-id"] = requestId;
  res.setHeader("X-Request-ID", requestId);
  next();
});

// HTTPS enforcement in production only when configured frontend origins use HTTPS.
const shouldEnforceHttps =
  config.nodeEnv === "production" &&
  allowedOrigins.some((origin) => origin.toLowerCase().startsWith("https://"));

if (shouldEnforceHttps) {
  app.use((req, res, next) => {
    if (req.header("x-forwarded-proto") !== "https") {
      res.redirect(`https://${req.header("host")}${req.url}`);
    } else {
      next();
    }
  });
}

// Helmet security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // Required for Excalidraw
          "'unsafe-eval'", // Required for Excalidraw
          "https://cdn.jsdelivr.net",
          "https://unpkg.com",
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'", // Required for Excalidraw
          "https://fonts.googleapis.com",
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'", "ws:", "wss:"],
        frameAncestors: ["'none'"],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
  })
);

app.use(
  cors({
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin ?? undefined)),
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "x-csrf-token", "x-imported-file"],
    exposedHeaders: ["x-csrf-token", "x-request-id"],
  })
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Request logging middleware
app.use((req, res, next) => {
  const requestId = req.headers["x-request-id"] || "unknown";
  const contentLength = req.headers["content-length"];
  const userEmail = req.user?.email || "anonymous";
  
  if (contentLength) {
    const sizeInMB = parseInt(contentLength, 10) / 1024 / 1024;
    if (sizeInMB > 10) {
      console.log(
        `[LARGE REQUEST] ${req.method} ${req.path} - ${sizeInMB.toFixed(
          2
        )}MB - User: ${userEmail} - RequestID: ${requestId}`
      );
    }
  }
  
  console.log(
    `[REQUEST] ${req.method} ${req.path} - User: ${userEmail} - IP: ${req.ip} - RequestID: ${requestId}`
  );
  
  next();
});

const RATE_LIMIT_WINDOW = 15 * 60 * 1000;

// General rate limiting with express-rate-limit
const generalRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW,
  max: config.rateLimitMaxRequests,
  message: {
    error: "Rate limit exceeded",
    message: "Too many requests, please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // We intentionally allow `app.set("trust proxy", true)` for deployments with multiple proxy layers.
  // express-rate-limit warns (and can throw) in that configuration; we accept the risk in favor of
  // correct client IP handling and rely on deployment-level network controls.
  validate: {
    trustProxy: false,
  },
  keyGenerator: (req) => getClientIp(req),
});

app.use(generalRateLimiter);

const apiApp = express();
app.use(config.apiBasePath, apiApp);

registerCsrfProtection({
  app: apiApp,
  isAllowedOrigin,
  maxRequestsPerWindow: config.csrfMaxRequests,
  enableDebugLogging: process.env.DEBUG_CSRF === "true",
});

// Authentication routes (no CSRF required, uses JWT)
apiApp.use("/auth", authRouter);

// Files field can contain arbitrary file metadata, so we use unknown and validate structure
const filesFieldSchema = z
  .union([z.record(z.string(), z.unknown()), z.null()])
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

const drawingUpdateSchemaBase = drawingBaseSchema
  .extend({
    elements: elementSchema.array().optional(),
    appState: appStateSchema.optional(),
    files: filesFieldSchema,
    version: z.number().int().positive().optional(),
  });

export const sanitizeDrawingUpdateData = (
  data: {
    elements?: unknown[];
    appState?: Record<string, unknown>;
    files?: Record<string, unknown>;
    preview?: string | null;
    name?: string;
    collectionId?: string | null;
  }
): boolean => {
  const hasSceneFields =
    data.elements !== undefined ||
    data.appState !== undefined ||
    data.files !== undefined;
  const hasPreviewField = data.preview !== undefined;
  const needsSanitization = hasSceneFields || hasPreviewField;

  try {
    const sanitizedData = { ...data };
    if (hasSceneFields) {
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
      if (data.elements !== undefined) sanitizedData.elements = sanitized.elements;
      if (data.appState !== undefined) sanitizedData.appState = sanitized.appState;
      if (data.files !== undefined) sanitizedData.files = sanitized.files;
      if (data.preview !== undefined) sanitizedData.preview = sanitized.preview;
      Object.assign(data, sanitizedData);
    } else if (hasPreviewField && typeof data.preview === "string") {
      // Preview-only updates must not inject default scene fields.
      data.preview = sanitizeSvg(data.preview);
      Object.assign(data, { ...data, preview: data.preview });
    } else if (hasPreviewField && data.preview === null) {
      // Explicitly allow clearing preview without touching scene data.
      Object.assign(data, sanitizedData);
    }
    return true;
  } catch (error) {
    console.error("Sanitization failed:", error);
    if (!needsSanitization) {
      return true;
    }
    return false;
  }
};

const drawingUpdateSchema = drawingUpdateSchemaBase.refine(
    (data) => sanitizeDrawingUpdateData(data as any),
    {
      message: "Invalid or malicious drawing data detected",
    }
  );

const respondWithValidationErrors = (
  res: express.Response,
  issues: z.ZodIssue[]
) => {
  // In production, don't expose validation details
  if (config.nodeEnv === "production") {
    res.status(400).json({
      error: "Validation error",
      message: "Invalid request data",
    });
  } else {
    res.status(400).json({
      error: "Invalid drawing payload",
      details: issues,
    });
  }
};

// Collection name validation schema
const collectionNameSchema = z.string().trim().min(1).max(100);

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

registerSocketHandlers({
  io,
  prisma,
  authModeService,
  jwtSecret: config.jwtSecret,
});

apiApp.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Health check endpoint doesn't require auth

registerDashboardRoutes(apiApp, {
  prisma,
  requireAuth,
  asyncHandler,
  parseJsonField,
  sanitizeText,
  validateImportedDrawing,
  drawingCreateSchema,
  drawingUpdateSchema,
  respondWithValidationErrors,
  collectionNameSchema,
  ensureTrashCollection,
  invalidateDrawingsCache,
  buildDrawingsCacheKey,
  getCachedDrawingsBody,
  cacheDrawingsResponse,
  MAX_PAGE_SIZE,
  config,
  logAuditEvent,
});

registerImportExportRoutes({
  app: apiApp,
  prisma,
  requireAuth,
  asyncHandler,
  upload,
  uploadDir,
  backendRoot,
  getBackendVersion,
  parseJsonField,
  sanitizeText,
  validateImportedDrawing,
  ensureTrashCollection,
  invalidateDrawingsCache,
  removeFileIfExists,
  verifyDatabaseIntegrityAsync,
  MAX_IMPORT_ARCHIVE_ENTRIES,
  MAX_IMPORT_COLLECTIONS,
  MAX_IMPORT_DRAWINGS,
  MAX_IMPORT_MANIFEST_BYTES,
  MAX_IMPORT_DRAWING_BYTES,
  MAX_IMPORT_TOTAL_EXTRACTED_BYTES,
});

// Error handler middleware (must be last)
app.use(errorHandler);

export { app, httpServer };

const isMain =
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  typeof require !== "undefined" && require.main === module;

if (isMain) {
  httpServer.listen(PORT, async () => {
    await initializeUploadDir();
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${config.nodeEnv}`);
    console.log(`Frontend URL: ${config.frontendUrl}`);
    console.log(
      `API endpoints: ${config.apiBasePath === "/" ? "/" : `${config.apiBasePath}/`}*`
    );
  });
}
