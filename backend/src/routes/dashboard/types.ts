import express from "express";
import { z } from "zod";
import { Prisma, PrismaClient } from "../../generated/client";

export type SortField = "name" | "createdAt" | "updatedAt";
export type SortDirection = "asc" | "desc";

type BuildDrawingsCacheKey = (keyParts: {
  userId: string;
  searchTerm: string;
  collectionFilter: string;
  includeData: boolean;
  sortField: SortField;
  sortDirection: SortDirection;
}) => string;

type EnsureTrashCollection = (
  db: Prisma.TransactionClient | PrismaClient,
  userId: string
) => Promise<void>;

type LogAuditEvent = (params: {
  userId: string;
  action: string;
  resource?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}) => Promise<void>;

export type DashboardRouteDeps = {
  prisma: PrismaClient;
  requireAuth: express.RequestHandler;
  optionalAuth: express.RequestHandler;
  asyncHandler: <T = void>(
    fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<T>
  ) => express.RequestHandler;
  parseJsonField: <T>(rawValue: string | null | undefined, fallback: T) => T;
  sanitizeText: (input: unknown, maxLength?: number) => string;
  validateImportedDrawing: (data: unknown) => boolean;
  drawingCreateSchema: z.ZodTypeAny;
  drawingUpdateSchema: z.ZodTypeAny;
  respondWithValidationErrors: (res: express.Response, issues: z.ZodIssue[]) => void;
  collectionNameSchema: z.ZodTypeAny;
  ensureTrashCollection: EnsureTrashCollection;
  invalidateDrawingsCache: () => void;
  invalidateDrawingsCacheForUser: (userId: string) => void;
  buildDrawingsCacheKey: BuildDrawingsCacheKey;
  getCachedDrawingsBody: (key: string) => Buffer | null;
  cacheDrawingsResponse: (key: string, payload: unknown) => Buffer;
  MAX_PAGE_SIZE: number;
  config: {
    nodeEnv: string;
    enableAuditLogging: boolean;
  };
  logAuditEvent: LogAuditEvent;
};
