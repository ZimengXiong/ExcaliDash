import express from "express";
import { Prisma } from "../../generated/client";
import { DashboardRouteDeps, SortDirection, SortField } from "./types";
import {
  getUserTrashCollectionId,
  isTrashCollectionId,
  toInternalTrashCollectionId,
  toPublicTrashCollectionId,
} from "./trash";
import {
  ensureShareLinkForRole,
  isAtLeastRole,
  isShareRole,
  rotateShareLinkForRole,
  resolveDrawingAccess,
} from "../../server/drawingAccess";

const getRouteIdParam = (value: string | string[] | undefined): string | null => {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim().length > 0) {
    return value[0];
  }
  return null;
};

const getShareTokenFromRequest = (req: express.Request): string | undefined => {
  const value = req.headers["x-share-token"];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim().length > 0) {
    return value[0].trim();
  }
  return undefined;
};

const payloadHasOnlySceneFields = (payload: Record<string, unknown>): boolean => {
  const allowed = new Set(["elements", "appState", "files", "preview", "version"]);
  return Object.keys(payload).every((key) => allowed.has(key));
};

export const registerDrawingRoutes = (
  app: express.Express,
  deps: DashboardRouteDeps
) => {
  const {
    prisma,
    authModeService,
    requireAuth,
    asyncHandler,
    parseJsonField,
    validateImportedDrawing,
    drawingCreateSchema,
    drawingUpdateSchema,
    respondWithValidationErrors,
    ensureTrashCollection,
    invalidateDrawingsCache,
    buildDrawingsCacheKey,
    getCachedDrawingsBody,
    cacheDrawingsResponse,
    MAX_PAGE_SIZE,
    config,
    logAuditEvent,
  } = deps;

  app.get("/drawings", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const trashCollectionId = getUserTrashCollectionId(req.user.id);
    const { search, collectionId, includeData, limit, offset, sortField, sortDirection } = req.query;
    const where: Prisma.DrawingWhereInput = { userId: req.user.id };
    const searchTerm =
      typeof search === "string" && search.trim().length > 0 ? search.trim() : undefined;

    if (searchTerm) {
      where.name = { contains: searchTerm };
    }

    let collectionFilterKey = "default";
    if (collectionId === "null") {
      where.collectionId = null;
      collectionFilterKey = "null";
    } else if (collectionId) {
      const normalizedCollectionId = String(collectionId);
      if (normalizedCollectionId === "trash") {
        where.collectionId = { in: [trashCollectionId, "trash"] };
        collectionFilterKey = "trash";
      } else {
        const collection = await prisma.collection.findFirst({
          where: { id: normalizedCollectionId, userId: req.user.id },
        });
        if (!collection) {
          return res.status(404).json({ error: "Collection not found" });
        }
        where.collectionId = normalizedCollectionId;
        collectionFilterKey = `id:${normalizedCollectionId}`;
      }
    } else {
      where.OR = [
        { collectionId: { notIn: [trashCollectionId, "trash"] } },
        { collectionId: null },
      ];
    }

    const shouldIncludeData =
      typeof includeData === "string"
        ? includeData.toLowerCase() === "true" || includeData === "1"
        : false;
    const parsedSortField: SortField =
      sortField === "name" || sortField === "createdAt" || sortField === "updatedAt"
        ? sortField
        : "updatedAt";
    const parsedSortDirection: SortDirection =
      sortDirection === "asc" || sortDirection === "desc"
        ? sortDirection
        : parsedSortField === "name"
        ? "asc"
        : "desc";

    const rawLimit = limit ? Number.parseInt(limit as string, 10) : undefined;
    const rawOffset = offset ? Number.parseInt(offset as string, 10) : undefined;
    const parsedLimit =
      rawLimit !== undefined && Number.isFinite(rawLimit)
        ? Math.min(Math.max(rawLimit, 1), MAX_PAGE_SIZE)
        : undefined;
    const parsedOffset =
      rawOffset !== undefined && Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : undefined;

    const cacheKey =
      buildDrawingsCacheKey({
        userId: req.user.id,
        searchTerm: searchTerm ?? "",
        collectionFilter: collectionFilterKey,
        includeData: shouldIncludeData,
        sortField: parsedSortField,
        sortDirection: parsedSortDirection,
      }) + `:${parsedLimit}:${parsedOffset}`;

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

    const orderBy: Prisma.DrawingOrderByWithRelationInput =
      parsedSortField === "name"
        ? { name: parsedSortDirection }
        : parsedSortField === "createdAt"
        ? { createdAt: parsedSortDirection }
        : { updatedAt: parsedSortDirection };

    const queryOptions: Prisma.DrawingFindManyArgs = { where, orderBy };
    if (parsedLimit !== undefined) queryOptions.take = parsedLimit;
    if (parsedOffset !== undefined) queryOptions.skip = parsedOffset;
    if (!shouldIncludeData) queryOptions.select = summarySelect;

    const [drawings, totalCount] = await Promise.all([
      prisma.drawing.findMany(queryOptions),
      prisma.drawing.count({ where }),
    ]);

    let responsePayload: any[] = drawings as any[];
    if (shouldIncludeData) {
      responsePayload = (drawings as any[]).map((d: any) => ({
        ...d,
        accessRole: "owner",
        collectionId: toPublicTrashCollectionId(d.collectionId, req.user!.id),
        elements: parseJsonField(d.elements, []),
        appState: parseJsonField(d.appState, {}),
        files: parseJsonField(d.files, {}),
      }));
    } else {
      responsePayload = (drawings as any[]).map((d: any) => ({
        ...d,
        accessRole: "owner",
        collectionId: toPublicTrashCollectionId(d.collectionId, req.user!.id),
      }));
    }

    const finalResponse = {
      drawings: responsePayload,
      totalCount,
      limit: parsedLimit,
      offset: parsedOffset,
    };

    const body = cacheDrawingsResponse(cacheKey, finalResponse);
    res.setHeader("X-Cache", "MISS");
    res.setHeader("Content-Type", "application/json");
    return res.send(body);
  }));

  app.get("/drawings/shared", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const authEnabled = await authModeService.getAuthEnabled();
    if (!authEnabled) {
      return res.status(404).json({ error: "Not found" });
    }

    const { search, includeData, limit, offset, sortField, sortDirection } = req.query;
    const searchTerm =
      typeof search === "string" && search.trim().length > 0 ? search.trim() : undefined;

    const shouldIncludeData =
      typeof includeData === "string"
        ? includeData.toLowerCase() === "true" || includeData === "1"
        : false;

    const parsedSortField: SortField =
      sortField === "name" || sortField === "createdAt" || sortField === "updatedAt"
        ? sortField
        : "updatedAt";
    const parsedSortDirection: SortDirection =
      sortDirection === "asc" || sortDirection === "desc"
        ? sortDirection
        : parsedSortField === "name"
        ? "asc"
        : "desc";

    const rawLimit = limit ? Number.parseInt(limit as string, 10) : undefined;
    const rawOffset = offset ? Number.parseInt(offset as string, 10) : undefined;
    const parsedLimit =
      rawLimit !== undefined && Number.isFinite(rawLimit)
        ? Math.min(Math.max(rawLimit, 1), MAX_PAGE_SIZE)
        : undefined;
    const parsedOffset =
      rawOffset !== undefined && Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : undefined;

    const baseRows = await prisma.$queryRaw<Array<{
      id: string;
      name: string;
      collectionId: string | null;
      preview: string | null;
      version: number;
      createdAt: string;
      updatedAt: string;
      elements: string;
      appState: string;
      files: string;
      ownerId: string;
      ownerName: string;
      ownerEmail: string;
      roleRank: number;
    }>>(Prisma.sql`
      SELECT
        d."id" AS id,
        d."name" AS name,
        d."collectionId" AS "collectionId",
        d."preview" AS preview,
        d."version" AS version,
        d."createdAt" AS "createdAt",
        d."updatedAt" AS "updatedAt",
        d."elements" AS elements,
        d."appState" AS "appState",
        d."files" AS files,
        u."id" AS "ownerId",
        u."name" AS "ownerName",
        u."email" AS "ownerEmail",
        MAX(CASE g."role" WHEN 'editor' THEN 2 WHEN 'viewer' THEN 1 ELSE 0 END) AS "roleRank"
      FROM "DrawingShareGrant" g
      JOIN "Drawing" d ON d."id" = g."drawingId"
      JOIN "User" u ON u."id" = d."userId"
      WHERE g."userId" = ${req.user.id}
        AND d."userId" <> ${req.user.id}
        AND g."role" IN ('viewer', 'editor')
        ${searchTerm ? Prisma.sql`AND d."name" LIKE ${`%${searchTerm}%`}` : Prisma.empty}
      GROUP BY d."id", u."id"
    `);

    const sortedRows = [...baseRows].sort((a, b) => {
      const direction = parsedSortDirection === "asc" ? 1 : -1;
      if (parsedSortField === "name") {
        return a.name.localeCompare(b.name) * direction;
      }
      if (parsedSortField === "createdAt") {
        return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * direction;
      }
      return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * direction;
    });

    const totalCount = sortedRows.length;
    const start = parsedOffset ?? 0;
    const end = parsedLimit !== undefined ? start + parsedLimit : undefined;
    const pageRows = sortedRows.slice(start, end);

    const payload = pageRows.map((row) => {
      const accessRole = Number(row.roleRank) >= 2 ? "editor" : "viewer";
      const base = {
        id: row.id,
        name: row.name,
        preview: row.preview,
        version: row.version,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        collectionId: null,
        accessRole,
        owner: {
          id: row.ownerId,
          name: row.ownerName,
          email: row.ownerEmail,
        },
      } as Record<string, unknown>;

      if (shouldIncludeData) {
        base.elements = parseJsonField(row.elements, []);
        base.appState = parseJsonField(row.appState, {});
        base.files = parseJsonField(row.files, {});
      }

      return base;
    });

    return res.json({
      drawings: payload,
      totalCount,
      limit: parsedLimit,
      offset: parsedOffset,
    });
  }));

  app.get("/drawings/:id/share-links", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const authEnabled = await authModeService.getAuthEnabled();
    if (!authEnabled) {
      return res.status(404).json({ error: "Not found" });
    }

    const id = getRouteIdParam(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "Validation error", message: "Invalid id parameter" });
    }

    const drawing = await prisma.drawing.findFirst({ where: { id, userId: req.user.id }, select: { id: true } });
    if (!drawing) {
      return res.status(404).json({ error: "Drawing not found" });
    }

    const [viewer, editor] = await Promise.all([
      ensureShareLinkForRole(prisma, id, "viewer"),
      ensureShareLinkForRole(prisma, id, "editor"),
    ]);

    return res.json({
      drawingId: id,
      viewerToken: viewer.token,
      editorToken: editor.token,
    });
  }));

  app.post("/drawings/:id/share-links/:role/rotate", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const authEnabled = await authModeService.getAuthEnabled();
    if (!authEnabled) {
      return res.status(404).json({ error: "Not found" });
    }

    const id = getRouteIdParam(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "Validation error", message: "Invalid id parameter" });
    }

    const roleParam = getRouteIdParam(req.params.role);
    if (!isShareRole(roleParam)) {
      return res.status(400).json({ error: "Validation error", message: "Invalid share role" });
    }

    const drawing = await prisma.drawing.findFirst({ where: { id, userId: req.user.id }, select: { id: true } });
    if (!drawing) {
      return res.status(404).json({ error: "Drawing not found" });
    }

    const rotated = await rotateShareLinkForRole(prisma, id, roleParam);

    if (config.enableAuditLogging) {
      await logAuditEvent({
        userId: req.user.id,
        action: "drawing_share_link_rotated",
        resource: `drawing:${id}`,
        ipAddress: req.ip || req.connection.remoteAddress || undefined,
        userAgent: req.headers["user-agent"] || undefined,
        details: { drawingId: id, role: roleParam },
      });
    }

    return res.json({
      role: roleParam,
      drawingId: id,
      token: rotated.token,
    });
  }));

  app.get("/drawings/:id", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const id = getRouteIdParam(req.params.id);
    if (!id) return res.status(400).json({ error: "Validation error", message: "Invalid id parameter" });

    const access = await resolveDrawingAccess({
      prisma,
      drawingId: id,
      userId: req.user.id,
      shareToken: getShareTokenFromRequest(req),
    });

    if (!access) {
      return res.status(404).json({ error: "Drawing not found", message: "Drawing does not exist" });
    }

    if (access.tokenRedeemedRole && config.enableAuditLogging) {
      await logAuditEvent({
        userId: req.user.id,
        action: "drawing_share_token_redeemed",
        resource: `drawing:${id}`,
        ipAddress: req.ip || req.connection.remoteAddress || undefined,
        userAgent: req.headers["user-agent"] || undefined,
        details: { drawingId: id, role: access.tokenRedeemedRole },
      });
    }

    return res.json({
      ...access.drawing,
      accessRole: access.role,
      collectionId:
        access.role === "owner"
          ? toPublicTrashCollectionId(access.drawing.collectionId, req.user.id)
          : null,
      elements: parseJsonField(access.drawing.elements, []),
      appState: parseJsonField(access.drawing.appState, {}),
      files: parseJsonField(access.drawing.files, {}),
    });
  }));

  app.post("/drawings", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const isImportedDrawing = req.headers["x-imported-file"] === "true";
    if (isImportedDrawing && !validateImportedDrawing(req.body)) {
      return res.status(400).json({
        error: "Invalid imported drawing file",
        message: "The imported file contains potentially malicious content or invalid structure",
      });
    }

    const parsed = drawingCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return respondWithValidationErrors(res, parsed.error.issues);
    }

    const payload = parsed.data as {
      name?: string;
      collectionId?: string | null;
      elements: unknown[];
      appState: Record<string, unknown>;
      preview?: string | null;
      files?: Record<string, unknown>;
    };
    const drawingName = payload.name ?? "Untitled Drawing";
    const targetCollectionIdRaw = payload.collectionId === undefined ? null : payload.collectionId;
    const targetCollectionId =
      toInternalTrashCollectionId(targetCollectionIdRaw, req.user.id) ?? null;

    if (targetCollectionId && !isTrashCollectionId(targetCollectionId, req.user.id)) {
      const collection = await prisma.collection.findFirst({
        where: { id: targetCollectionId, userId: req.user.id },
      });
      if (!collection) return res.status(404).json({ error: "Collection not found" });
    } else if (targetCollectionIdRaw === "trash") {
      await ensureTrashCollection(prisma, req.user.id);
    }

    const newDrawing = await prisma.drawing.create({
      data: {
        name: drawingName,
        elements: JSON.stringify(payload.elements),
        appState: JSON.stringify(payload.appState),
        userId: req.user.id,
        collectionId: targetCollectionId,
        preview: payload.preview ?? null,
        files: JSON.stringify(payload.files ?? {}),
      },
    });
    invalidateDrawingsCache();

    return res.json({
      ...newDrawing,
      accessRole: "owner",
      collectionId: toPublicTrashCollectionId(newDrawing.collectionId, req.user.id),
      elements: parseJsonField(newDrawing.elements, []),
      appState: parseJsonField(newDrawing.appState, {}),
      files: parseJsonField(newDrawing.files, {}),
    });
  }));

  app.put("/drawings/:id", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const id = getRouteIdParam(req.params.id);
    if (!id) return res.status(400).json({ error: "Validation error", message: "Invalid id parameter" });

    const access = await resolveDrawingAccess({
      prisma,
      drawingId: id,
      userId: req.user.id,
    });
    if (!access) return res.status(404).json({ error: "Drawing not found" });

    const parsed = drawingUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      if (config.nodeEnv === "development") {
        console.error("[API] Validation failed", { id, errors: parsed.error.issues });
      }
      return respondWithValidationErrors(res, parsed.error.issues);
    }

    const payload = parsed.data as {
      name?: string;
      collectionId?: string | null;
      elements?: unknown[];
      appState?: Record<string, unknown>;
      preview?: string | null;
      files?: Record<string, unknown>;
      version?: number;
    };

    const payloadRecord = payload as unknown as Record<string, unknown>;

    if (!isAtLeastRole(access.role, "editor")) {
      return res.status(403).json({ error: "Forbidden", message: "You do not have edit access" });
    }

    if (access.role === "editor" && !payloadHasOnlySceneFields(payloadRecord)) {
      return res.status(403).json({ error: "Forbidden", message: "Editors can only update scene content" });
    }

    const trashCollectionId = getUserTrashCollectionId(req.user.id);
    const isSceneUpdate =
      payload.elements !== undefined ||
      payload.appState !== undefined ||
      payload.files !== undefined;
    const data: Prisma.DrawingUpdateInput = isSceneUpdate
      ? { version: { increment: 1 } }
      : {};

    if (payload.name !== undefined) data.name = payload.name;
    if (payload.elements !== undefined) data.elements = JSON.stringify(payload.elements);
    if (payload.appState !== undefined) data.appState = JSON.stringify(payload.appState);
    if (payload.files !== undefined) data.files = JSON.stringify(payload.files);
    if (payload.preview !== undefined) data.preview = payload.preview;

    if (payload.collectionId !== undefined) {
      if (access.role !== "owner") {
        return res.status(403).json({ error: "Forbidden", message: "Only the owner can move drawings" });
      }
      if (payload.collectionId === "trash") {
        await ensureTrashCollection(prisma, req.user.id);
        (data as Prisma.DrawingUncheckedUpdateInput).collectionId = trashCollectionId;
      } else if (payload.collectionId) {
        const collection = await prisma.collection.findFirst({
          where: { id: payload.collectionId, userId: req.user.id },
        });
        if (!collection) return res.status(404).json({ error: "Collection not found" });
        (data as Prisma.DrawingUncheckedUpdateInput).collectionId = payload.collectionId;
      } else {
        (data as Prisma.DrawingUncheckedUpdateInput).collectionId = null;
      }
    }

    const updateWhere: Prisma.DrawingWhereInput = { id };
    if (access.role === "owner") {
      updateWhere.userId = req.user.id;
    }
    if (isSceneUpdate && payload.version !== undefined) {
      updateWhere.version = payload.version;
    }

    const updateResult = await prisma.drawing.updateMany({
      where: updateWhere,
      data,
    });
    if (updateResult.count === 0) {
      if (isSceneUpdate && payload.version !== undefined) {
        const latestDrawing = await prisma.drawing.findFirst({
          where: { id },
          select: { version: true },
        });
        return res.status(409).json({
          error: "Conflict",
          code: "VERSION_CONFLICT",
          message: "Drawing has changed since this editor state was loaded.",
          currentVersion: latestDrawing?.version ?? null,
        });
      }
      return res.status(404).json({ error: "Drawing not found" });
    }

    const updatedDrawing = await prisma.drawing.findFirst({
      where: { id },
    });
    if (!updatedDrawing) {
      return res.status(404).json({ error: "Drawing not found" });
    }
    invalidateDrawingsCache();

    return res.json({
      ...updatedDrawing,
      accessRole: access.role,
      collectionId:
        access.role === "owner"
          ? toPublicTrashCollectionId(updatedDrawing.collectionId, req.user.id)
          : null,
      elements: parseJsonField(updatedDrawing.elements, []),
      appState: parseJsonField(updatedDrawing.appState, {}),
      files: parseJsonField(updatedDrawing.files, {}),
    });
  }));

  app.delete("/drawings/:id", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const id = getRouteIdParam(req.params.id);
    if (!id) return res.status(400).json({ error: "Validation error", message: "Invalid id parameter" });

    const drawing = await prisma.drawing.findFirst({ where: { id, userId: req.user.id } });
    if (!drawing) return res.status(404).json({ error: "Drawing not found" });

    const deleteResult = await prisma.drawing.deleteMany({
      where: { id, userId: req.user.id },
    });
    if (deleteResult.count === 0) {
      return res.status(404).json({ error: "Drawing not found" });
    }
    invalidateDrawingsCache();

    if (config.enableAuditLogging) {
      await logAuditEvent({
        userId: req.user.id,
        action: "drawing_deleted",
        resource: `drawing:${id}`,
        ipAddress: req.ip || req.connection.remoteAddress || undefined,
        userAgent: req.headers["user-agent"] || undefined,
        details: { drawingId: id, drawingName: drawing.name },
      });
    }

    return res.json({ success: true });
  }));

  app.post("/drawings/:id/duplicate", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const id = getRouteIdParam(req.params.id);
    if (!id) return res.status(400).json({ error: "Validation error", message: "Invalid id parameter" });

    const access = await resolveDrawingAccess({
      prisma,
      drawingId: id,
      userId: req.user.id,
    });
    if (!access) return res.status(404).json({ error: "Original drawing not found" });

    let duplicatedCollectionId = access.role === "owner" ? access.drawing.collectionId : null;
    if (access.role === "owner" && isTrashCollectionId(access.drawing.collectionId, req.user.id)) {
      await ensureTrashCollection(prisma, req.user.id);
      duplicatedCollectionId = getUserTrashCollectionId(req.user.id);
    }

    const newDrawing = await prisma.drawing.create({
      data: {
        name: `${access.drawing.name} (Copy)`,
        elements: access.drawing.elements,
        appState: access.drawing.appState,
        files: access.drawing.files,
        userId: req.user.id,
        collectionId: duplicatedCollectionId,
        version: 1,
      },
    });
    invalidateDrawingsCache();

    return res.json({
      ...newDrawing,
      accessRole: "owner",
      collectionId: toPublicTrashCollectionId(newDrawing.collectionId, req.user.id),
      elements: parseJsonField(newDrawing.elements, []),
      appState: parseJsonField(newDrawing.appState, {}),
      files: parseJsonField(newDrawing.files, {}),
    });
  }));
};
