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
  buildShareLinkToken,
  canEditDrawing,
  canViewDrawing,
  getDrawingAccess,
  hashShareLinkToken,
  isOwnerAccess,
  normalizeDrawingPermission,
  type DrawingPrincipal,
} from "../../authz/sharing";

export const registerDrawingRoutes = (
  app: express.Express,
  deps: DashboardRouteDeps
) => {
  const {
    prisma,
    requireAuth,
    optionalAuth,
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

  const getRequestPrincipal = async (
    req: express.Request
  ): Promise<DrawingPrincipal | null> => {
    if (req.user?.id) {
      return { kind: "user", userId: req.user.id };
    }
    return null;
  };

  const resolveDefaultTtlMs = (permission: "view" | "edit"): number => {
    const raw =
      permission === "edit"
        ? process.env.LINK_SHARE_EDIT_DEFAULT_TTL_MS
        : process.env.LINK_SHARE_VIEW_DEFAULT_TTL_MS;
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return permission === "edit" ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  };

  const resolveMaxTtlMs = (): number => {
    const parsed = Number(process.env.LINK_SHARE_MAX_TTL_MS);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return 90 * 24 * 60 * 60 * 1000;
  };

  const respondWithAuthErrorIfPresent = (
    req: express.Request,
    res: express.Response
  ): boolean => {
    if (!req.authError) return false;

    res.status(401).json({
      error: "Unauthorized",
      message: "Invalid or expired token",
    });
    return true;
  };

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
        collectionId: toPublicTrashCollectionId(d.collectionId, req.user!.id),
        elements: parseJsonField(d.elements, []),
        appState: parseJsonField(d.appState, {}),
        files: parseJsonField(d.files, {}),
      }));
    } else {
      responsePayload = (drawings as any[]).map((d: any) => ({
        ...d,
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

  // Shared with me list (does not mix into /drawings cache semantics)
  // Must be registered before `/drawings/:id` so it doesn't get treated as a drawing id.
  app.get("/drawings/shared", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

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

    const orderBy: Prisma.DrawingOrderByWithRelationInput =
      parsedSortField === "name"
        ? { name: parsedSortDirection }
        : parsedSortField === "createdAt"
        ? { createdAt: parsedSortDirection }
        : { updatedAt: parsedSortDirection };

    const whereDrawing: Prisma.DrawingWhereInput = {
      // "Shared with me" should only include drawings owned by someone else.
      // Some deployments keep an owner self-permission row for access control; exclude those.
      userId: { not: req.user.id },
      permissions: {
        some: {
          granteeUserId: req.user.id,
        },
      },
    };
    if (searchTerm) {
      whereDrawing.name = { contains: searchTerm };
    }

    const summarySelect: Prisma.DrawingSelect = {
      id: true,
      name: true,
      collectionId: true,
      preview: true,
      version: true,
      createdAt: true,
      updatedAt: true,
      userId: true,
      permissions: {
        where: { granteeUserId: req.user.id },
        select: { permission: true },
      },
    };

    const queryOptions: Prisma.DrawingFindManyArgs = { where: whereDrawing, orderBy };
    if (parsedLimit !== undefined) queryOptions.take = parsedLimit;
    if (parsedOffset !== undefined) queryOptions.skip = parsedOffset;
    if (!shouldIncludeData) queryOptions.select = summarySelect;

    const [drawings, totalCount] = await Promise.all([
      prisma.drawing.findMany(queryOptions),
      prisma.drawing.count({ where: whereDrawing }),
    ]);

    const normalize = (d: any) => {
      const rawPerm = Array.isArray(d?.permissions) ? d.permissions[0]?.permission : null;
      const perm = normalizeDrawingPermission(rawPerm) ?? "view";
      const { permissions: _permissions, ...rest } = d;
      return {
        ...rest,
        // Collections are owner-scoped; don't leak the owner's collection ids to viewers.
        collectionId: null,
        accessLevel: perm,
      };
    };

    let responsePayload: any[] = drawings as any[];
    if (shouldIncludeData) {
      responsePayload = (drawings as any[]).map((d: any) => {
        const normalized = normalize(d);
        return {
          ...normalized,
          elements: parseJsonField(d.elements, []),
          appState: parseJsonField(d.appState, {}),
          files: parseJsonField(d.files, {}),
        };
      });
    } else {
      responsePayload = (drawings as any[]).map((d: any) => normalize(d));
    }

    return res.json({
      drawings: responsePayload,
      totalCount,
      limit: parsedLimit,
      offset: parsedOffset,
    });
  }));

  app.get("/drawings/:id", optionalAuth, asyncHandler(async (req, res) => {
    const principal = await getRequestPrincipal(req);

    const { id } = req.params;
    const access = await getDrawingAccess({ prisma, principal, drawingId: id });
    if (!canViewDrawing(access)) {
      if (respondWithAuthErrorIfPresent(req, res)) return;
      return res.status(404).json({ error: "Drawing not found", message: "Drawing does not exist" });
    }

    const drawing = await prisma.drawing.findUnique({ where: { id } });
    if (!drawing) {
      return res.status(404).json({ error: "Drawing not found", message: "Drawing does not exist" });
    }

    const isOwner = principal?.kind === "user" && principal.userId === drawing.userId;
    return res.json({
      ...drawing,
      // Collections (and trash mapping) are owner-scoped. For shared/public access, avoid leaking
      // owner collection ids like `trash:<ownerId>` and avoid implying the viewer can organize it.
      collectionId: isOwner ? toPublicTrashCollectionId(drawing.collectionId, drawing.userId) : null,
      elements: parseJsonField(drawing.elements, []),
      appState: parseJsonField(drawing.appState, {}),
      files: parseJsonField(drawing.files, {}),
      accessLevel: access,
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
      collectionId: toPublicTrashCollectionId(newDrawing.collectionId, req.user.id),
      elements: parseJsonField(newDrawing.elements, []),
      appState: parseJsonField(newDrawing.appState, {}),
      files: parseJsonField(newDrawing.files, {}),
    });
  }));

  app.put("/drawings/:id", optionalAuth, asyncHandler(async (req, res) => {
    const principal = await getRequestPrincipal(req);

    const { id } = req.params;
    const access = await getDrawingAccess({ prisma, principal, drawingId: id });
    if (!canEditDrawing(access)) {
      if (respondWithAuthErrorIfPresent(req, res)) return;
      return res.status(404).json({ error: "Drawing not found" });
    }

    const existingDrawing = await prisma.drawing.findUnique({ where: { id } });
    if (!existingDrawing) return res.status(404).json({ error: "Drawing not found" });

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
    const ownerUserId = existingDrawing.userId;
    const trashCollectionId = getUserTrashCollectionId(ownerUserId);
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
      if (!isOwnerAccess(access)) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Only the owner can move drawings between collections",
        });
      }
      if (payload.collectionId === "trash") {
        await ensureTrashCollection(prisma, ownerUserId);
        (data as Prisma.DrawingUncheckedUpdateInput).collectionId = trashCollectionId;
      } else if (payload.collectionId) {
        const collection = await prisma.collection.findFirst({
          where: { id: payload.collectionId, userId: ownerUserId },
        });
        if (!collection) return res.status(404).json({ error: "Collection not found" });
        (data as Prisma.DrawingUncheckedUpdateInput).collectionId = payload.collectionId;
      } else {
        (data as Prisma.DrawingUncheckedUpdateInput).collectionId = null;
      }
    }

    const updateWhere: Prisma.DrawingWhereInput = { id };
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
      collectionId: toPublicTrashCollectionId(updatedDrawing.collectionId, ownerUserId),
      elements: parseJsonField(updatedDrawing.elements, []),
      appState: parseJsonField(updatedDrawing.appState, {}),
      files: parseJsonField(updatedDrawing.files, {}),
      accessLevel: access,
    });
  }));

  app.delete("/drawings/:id", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;

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

    const { id } = req.params;
    const original = await prisma.drawing.findFirst({ where: { id, userId: req.user.id } });
    if (!original) return res.status(404).json({ error: "Original drawing not found" });
    let duplicatedCollectionId = original.collectionId;
    if (isTrashCollectionId(original.collectionId, req.user.id)) {
      await ensureTrashCollection(prisma, req.user.id);
      duplicatedCollectionId = getUserTrashCollectionId(req.user.id);
    }

    const newDrawing = await prisma.drawing.create({
      data: {
        name: `${original.name} (Copy)`,
        elements: original.elements,
        appState: original.appState,
        files: original.files,
        userId: req.user.id,
        collectionId: duplicatedCollectionId,
        version: 1,
      },
    });
    invalidateDrawingsCache();

    return res.json({
      ...newDrawing,
      collectionId: toPublicTrashCollectionId(newDrawing.collectionId, req.user.id),
      elements: parseJsonField(newDrawing.elements, []),
      appState: parseJsonField(newDrawing.appState, {}),
      files: parseJsonField(newDrawing.files, {}),
    });
  }));

  // Owner-only: resolve users by name/email in the context of a drawing you own (reduces enumeration risk).
  app.get("/drawings/:id/share-resolve", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const qRaw = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const q = qRaw.toLowerCase();
    if (q.length < 3) return res.json({ users: [] });

    const drawing = await prisma.drawing.findUnique({ where: { id }, select: { userId: true } });
    if (!drawing || drawing.userId !== req.user.id) {
      return res.status(404).json({ error: "Drawing not found" });
    }

    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        id: { not: req.user.id },
        OR: [
          { email: { contains: q } },
          { name: { contains: q } },
          { username: { contains: q } },
        ],
      },
      select: { id: true, name: true, email: true },
      take: 10,
    });

    return res.json({ users });
  }));

  app.get("/drawings/:id/sharing", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;

    const drawing = await prisma.drawing.findUnique({ where: { id }, select: { userId: true } });
    if (!drawing || drawing.userId !== req.user.id) {
      return res.status(404).json({ error: "Drawing not found" });
    }

    const [permissions, linkShares] = await Promise.all([
      prisma.drawingPermission.findMany({
        where: { drawingId: id },
        select: {
          id: true,
          granteeUserId: true,
          permission: true,
          createdAt: true,
          updatedAt: true,
          granteeUser: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.drawingLinkShare.findMany({
        where: { drawingId: id },
        select: {
          id: true,
          permission: true,
          expiresAt: true,
          revokedAt: true,
          createdAt: true,
          updatedAt: true,
          lastUsedAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return res.json({ permissions, linkShares });
  }));

  app.post("/drawings/:id/permissions", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;

    const drawing = await prisma.drawing.findUnique({ where: { id }, select: { userId: true } });
    if (!drawing || drawing.userId !== req.user.id) {
      return res.status(404).json({ error: "Drawing not found" });
    }

    const granteeUserId = typeof req.body?.granteeUserId === "string" ? req.body.granteeUserId : null;
    const permission = normalizeDrawingPermission(req.body?.permission);
    if (!granteeUserId || !permission) {
      return res.status(400).json({ error: "Validation error", message: "Invalid grantee or permission" });
    }
    if (granteeUserId === req.user.id) {
      return res.status(400).json({ error: "Validation error", message: "Cannot share with yourself" });
    }

    const user = await prisma.user.findUnique({
      where: { id: granteeUserId },
      select: { id: true, isActive: true },
    });
    if (!user || !user.isActive) {
      return res.status(404).json({ error: "User not found" });
    }

    const saved = await prisma.drawingPermission.upsert({
      where: {
        drawingId_granteeUserId: { drawingId: id, granteeUserId },
      },
      update: { permission, createdByUserId: req.user.id },
      create: { drawingId: id, granteeUserId, permission, createdByUserId: req.user.id },
      select: {
        id: true,
        granteeUserId: true,
        permission: true,
        createdAt: true,
        updatedAt: true,
        granteeUser: { select: { id: true, name: true, email: true } },
      },
    });

    invalidateDrawingsCache();

    if (config.enableAuditLogging) {
      await logAuditEvent({
        userId: req.user.id,
        action: "drawing_shared_user_upsert",
        resource: `drawing:${id}`,
        ipAddress: req.ip || req.connection.remoteAddress || undefined,
        userAgent: req.headers["user-agent"] || undefined,
        details: { drawingId: id, granteeUserId, permission },
      });
    }

    return res.json({ permission: saved });
  }));

  app.delete("/drawings/:id/permissions/:permId", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { id, permId } = req.params;

    const drawing = await prisma.drawing.findUnique({ where: { id }, select: { userId: true } });
    if (!drawing || drawing.userId !== req.user.id) {
      return res.status(404).json({ error: "Drawing not found" });
    }

    await prisma.drawingPermission.deleteMany({
      where: { id: permId, drawingId: id },
    });
    invalidateDrawingsCache();

    if (config.enableAuditLogging) {
      await logAuditEvent({
        userId: req.user.id,
        action: "drawing_shared_user_revoke",
        resource: `drawing:${id}`,
        ipAddress: req.ip || req.connection.remoteAddress || undefined,
        userAgent: req.headers["user-agent"] || undefined,
        details: { drawingId: id, permissionId: permId },
      });
    }

    return res.json({ success: true });
  }));

  app.post("/drawings/:id/link-shares", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { id } = req.params;

    const drawing = await prisma.drawing.findUnique({ where: { id }, select: { userId: true } });
    if (!drawing || drawing.userId !== req.user.id) {
      return res.status(404).json({ error: "Drawing not found" });
    }

    const permission = normalizeDrawingPermission(req.body?.permission);
    if (!permission) {
      return res.status(400).json({ error: "Validation error", message: "Invalid permission" });
    }

    const rawExpiresAt = typeof req.body?.expiresAt === "string" ? req.body.expiresAt : null;
    const expiresAtText = (rawExpiresAt || "").trim();
    const requestedExpiresAt = expiresAtText.length > 0 ? new Date(expiresAtText) : null;
    const hasValidRequestedExpiry = Boolean(requestedExpiresAt && Number.isFinite(requestedExpiresAt.getTime()));

    const now = Date.now();
    const maxTtlMs = resolveMaxTtlMs();
    const defaultTtlMs = resolveDefaultTtlMs(permission);

    let expiresAt: Date | null = null;
    // View links can be truly non-expiring unless an explicit expiry is provided.
    // Edit links default to an expiry window when none is provided.
    if (permission === "view" && !hasValidRequestedExpiry && expiresAtText.length === 0) {
      expiresAt = null;
    } else {
      const candidateTtlMs = hasValidRequestedExpiry && requestedExpiresAt
        ? requestedExpiresAt.getTime() - now
        : defaultTtlMs;
      const ttlMs = Math.min(Math.max(candidateTtlMs, 60_000), maxTtlMs);
      expiresAt = new Date(now + ttlMs);
    }

    // Passphrase support is currently disabled. We keep passphraseHash nullable for backwards compatibility.
    const passphraseHashValue: string | null = null;

    // Enforce a single active "anyone with the link" policy per drawing. The public link is the drawing id,
    // so multiple active link-share rows would be confusing and could unintentionally widen access.
    await prisma.drawingLinkShare.updateMany({
      where: { drawingId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Token is generated only to satisfy the current schema's tokenHash requirement.
    // Link access is based on drawing id + active policy (no secret token in the URL).
    const tokenHash = hashShareLinkToken(buildShareLinkToken());

    const created = await prisma.drawingLinkShare.create({
      data: {
        drawingId: id,
        permission,
        tokenHash,
        passphraseHash: passphraseHashValue,
        expiresAt,
        createdByUserId: req.user.id,
      },
      select: {
        id: true,
        permission: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });

    if (config.enableAuditLogging) {
      await logAuditEvent({
        userId: req.user.id,
        action: "drawing_link_share_created",
        resource: `drawing:${id}`,
        ipAddress: req.ip || req.connection.remoteAddress || undefined,
        userAgent: req.headers["user-agent"] || undefined,
        details: { drawingId: id, permission, expiresAt: expiresAt ? expiresAt.toISOString() : null },
      });
    }

    return res.json({ share: created });
  }));

  app.delete("/drawings/:id/link-shares/:shareId", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { id, shareId } = req.params;

    const drawing = await prisma.drawing.findUnique({ where: { id }, select: { userId: true } });
    if (!drawing || drawing.userId !== req.user.id) {
      return res.status(404).json({ error: "Drawing not found" });
    }

    await prisma.drawingLinkShare.updateMany({
      where: { id: shareId, drawingId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (config.enableAuditLogging) {
      await logAuditEvent({
        userId: req.user.id,
        action: "drawing_link_share_revoked",
        resource: `drawing:${id}`,
        ipAddress: req.ip || req.connection.remoteAddress || undefined,
        userAgent: req.headers["user-agent"] || undefined,
        details: { drawingId: id, shareId },
      });
    }

    return res.json({ success: true });
  }));

  // Legacy share-token exchange endpoint removed: link access is based on drawing id + active policy.
};
