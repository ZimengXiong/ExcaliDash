import express from "express";
import { Prisma } from "../../generated/client";
import {
  canViewDrawing,
  getDrawingAccess,
  normalizeDrawingPermission,
} from "../../authz/sharing";
import { getUserTrashCollectionId, toPublicTrashCollectionId } from "./trash";
import { SortDirection, SortField } from "./types";
import type { DrawingRouteContext } from "./drawingRouteContext";

// Server-side page size applied when a client omits `limit`, so the list
// endpoints can never return an unbounded payload (previously every drawing,
// with inline previews, was serialized into a single response).
const DEFAULT_PAGE_SIZE = 50;

export const registerDrawingListRoutes = (
  app: express.Express,
  context: DrawingRouteContext,
) => {
  const {
    prisma,
    requireAuth,
    optionalAuth,
    asyncHandler,
    parseJsonField,
    getRequestPrincipal,
    respondWithAuthErrorIfPresent,
    buildDrawingsCacheKey,
    getCachedDrawingsBody,
    cacheDrawingsResponse,
    MAX_PAGE_SIZE,
  } = context;

  const clampLimit = (raw: string | undefined): number => {
    const parsed = raw ? Number.parseInt(raw, 10) : undefined;
    if (parsed === undefined || !Number.isFinite(parsed)) return DEFAULT_PAGE_SIZE;
    return Math.min(Math.max(parsed, 1), MAX_PAGE_SIZE);
  };

  const clampOffset = (raw: string | undefined): number => {
    const parsed = raw ? Number.parseInt(raw, 10) : undefined;
    if (parsed === undefined || !Number.isFinite(parsed)) return 0;
    return Math.max(parsed, 0);
  };

  app.get(
    "/drawings",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const trashCollectionId = getUserTrashCollectionId(req.user.id);
      const {
        search,
        collectionId,
        includeData,
        limit,
        offset,
        sortField,
        sortDirection,
      } = req.query;
      const where: Prisma.DrawingWhereInput = { userId: req.user.id };
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
        if (normalizedCollectionId === "trash") {
          where.collectionId = { in: [trashCollectionId, "trash"] };
          collectionFilterKey = "trash";
        } else {
          const collection = await prisma.collection.findFirst({
            where: { id: normalizedCollectionId },
          });
          if (!collection) {
            return res.status(404).json({ error: "Collection not found" });
          }

          // Check if user is owner or has a share entry
          const isOwner = collection.userId === req.user.id;
          if (!isOwner) {
            const share = await prisma.collectionShare.findFirst({
              where: {
                collectionId: normalizedCollectionId,
                granteeUserId: req.user.id,
              },
            });
            if (!share) {
              return res.status(404).json({ error: "Collection not found" });
            }
          }
          // Always fetch all drawings in the collection regardless of who created them
          delete (where as any).userId;

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
        sortField === "name" ||
        sortField === "createdAt" ||
        sortField === "updatedAt"
          ? sortField
          : "updatedAt";
      const parsedSortDirection: SortDirection =
        sortDirection === "asc" || sortDirection === "desc"
          ? sortDirection
          : parsedSortField === "name"
            ? "asc"
            : "desc";

      const parsedLimit = clampLimit(limit as string | undefined);
      const parsedOffset = clampOffset(offset as string | undefined);

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

      // Previews are intentionally excluded from list responses; they are served
      // per-drawing from GET /drawings/:id/preview (ETag-cacheable).
      const summarySelect: Prisma.DrawingSelect = {
        id: true,
        name: true,
        collectionId: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, name: true } },
      };

      const orderBy: Prisma.DrawingOrderByWithRelationInput =
        parsedSortField === "name"
          ? { name: parsedSortDirection }
          : parsedSortField === "createdAt"
            ? { createdAt: parsedSortDirection }
            : { updatedAt: parsedSortDirection };

      const queryOptions: Prisma.DrawingFindManyArgs = {
        where,
        orderBy,
        take: parsedLimit,
        skip: parsedOffset,
      };
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
          creatorName: d.user?.name ?? null,
          user: undefined,
        }));
      } else {
        responsePayload = (drawings as any[]).map((d: any) => ({
          ...d,
          collectionId: toPublicTrashCollectionId(d.collectionId, req.user!.id),
          creatorName: d.user?.name ?? null,
          user: undefined,
        }));
      }

      const finalResponse = {
        drawings: responsePayload,
        totalCount,
        limit: parsedLimit,
        offset: parsedOffset,
      };

      const body = cacheDrawingsResponse(cacheKey, finalResponse, req.user.id);
      res.setHeader("X-Cache", "MISS");
      res.setHeader("Content-Type", "application/json");
      return res.send(body);
    }),
  );

  // Per-drawing preview: small, ETag-cacheable, revalidates against updatedAt.
  // Registered before `/drawings/:id` so previews aren't treated as an id.
  app.get(
    "/drawings/:id/preview",
    optionalAuth,
    asyncHandler(async (req, res) => {
      const principal = await getRequestPrincipal(req);
      const { id } = req.params;

      const access = await getDrawingAccess({ prisma, principal, drawingId: id });
      if (!canViewDrawing(access)) {
        if (respondWithAuthErrorIfPresent(req, res)) return;
        return res.status(404).json({
          error: "Drawing not found",
          message: "Drawing does not exist",
        });
      }

      const drawing = await prisma.drawing.findUnique({
        where: { id },
        select: { preview: true, updatedAt: true },
      });
      if (!drawing) {
        return res.status(404).json({
          error: "Drawing not found",
          message: "Drawing does not exist",
        });
      }

      const updatedAtMs = new Date(drawing.updatedAt).getTime();
      const etag = `W/"preview-${id}-${updatedAtMs}"`;
      res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
      res.setHeader("ETag", etag);
      if (req.headers["if-none-match"] === etag) {
        return res.status(304).end();
      }

      return res.json({ preview: drawing.preview ?? null, updatedAt: updatedAtMs });
    }),
  );

  // Shared with me list (does not mix into /drawings cache semantics)
  // Must be registered before `/drawings/:id` so it doesn't get treated as a drawing id.
  app.get(
    "/drawings/shared",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const { search, includeData, limit, offset, sortField, sortDirection } =
        req.query;
      const searchTerm =
        typeof search === "string" && search.trim().length > 0
          ? search.trim()
          : undefined;

      const shouldIncludeData =
        typeof includeData === "string"
          ? includeData.toLowerCase() === "true" || includeData === "1"
          : false;
      const parsedSortField: SortField =
        sortField === "name" ||
        sortField === "createdAt" ||
        sortField === "updatedAt"
          ? sortField
          : "updatedAt";
      const parsedSortDirection: SortDirection =
        sortDirection === "asc" || sortDirection === "desc"
          ? sortDirection
          : parsedSortField === "name"
            ? "asc"
            : "desc";

      const parsedLimit = clampLimit(limit as string | undefined);
      const parsedOffset = clampOffset(offset as string | undefined);

      const orderBy: Prisma.DrawingOrderByWithRelationInput =
        parsedSortField === "name"
          ? { name: parsedSortDirection }
          : parsedSortField === "createdAt"
            ? { createdAt: parsedSortDirection }
            : { updatedAt: parsedSortDirection };

      // Get collection IDs shared with this user to exclude drawings already visible via collection sharing
      const sharedCollectionIds = await prisma.collectionShare.findMany({
        where: { granteeUserId: req.user.id },
        select: { collectionId: true },
      });
      const sharedColIds = sharedCollectionIds.map((s) => s.collectionId);

      const whereDrawing: Prisma.DrawingWhereInput = {
        // "Shared with me" should only include drawings owned by someone else.
        // Some deployments keep an owner self-permission row for access control; exclude those.
        userId: { not: req.user.id },
        permissions: {
          some: {
            granteeUserId: req.user.id,
            // Recipients can hide a shared drawing from their own list.
            hidden: false,
          },
        },
        // Exclude drawings already accessible via a shared collection
        ...(sharedColIds.length > 0 && {
          NOT: {
            collectionId: { in: sharedColIds },
          },
        }),
      };
      if (searchTerm) {
        whereDrawing.name = { contains: searchTerm };
      }

      const summarySelect: Prisma.DrawingSelect = {
        id: true,
        name: true,
        collectionId: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
        permissions: {
          where: { granteeUserId: req.user.id },
          select: { permission: true },
        },
      };

      const queryOptions: Prisma.DrawingFindManyArgs = {
        where: whereDrawing,
        orderBy,
        take: parsedLimit,
        skip: parsedOffset,
      };
      if (!shouldIncludeData) queryOptions.select = summarySelect;

      const [drawings, totalCount] = await Promise.all([
        prisma.drawing.findMany(queryOptions),
        prisma.drawing.count({ where: whereDrawing }),
      ]);

      const normalize = (d: any) => {
        const rawPerm = Array.isArray(d?.permissions)
          ? d.permissions[0]?.permission
          : null;
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
    }),
  );

};
