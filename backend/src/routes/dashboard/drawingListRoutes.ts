import express from "express";
import { Prisma, type Drawing } from "../../generated/client";
import { matchesIfNoneMatch } from "../../server/ifNoneMatch";
import {
  canViewDrawing,
  getDrawingAccess,
  normalizeDrawingPermission,
} from "../../authz/sharing";
import {
  getUserTrashCollectionId,
  isTrashCollectionId,
  LEGACY_TRASH_COLLECTION_ID,
  toPublicTrashCollectionId,
  TRASH_COLLECTION_PREFIX,
} from "./trash";
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
    if (parsed === undefined || !Number.isFinite(parsed))
      return DEFAULT_PAGE_SIZE;
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
            where: {
              id: normalizedCollectionId,
              OR: [
                { userId: req.user.id },
                { shares: { some: { granteeUserId: req.user.id } } },
              ],
            },
            select: { id: true, userId: true },
          });
          if (
            !collection ||
            (isTrashCollectionId(collection.id, collection.userId) &&
              collection.userId !== req.user.id)
          ) {
            return res.status(404).json({ error: "Collection not found" });
          }

          // Always fetch all drawings in the collection regardless of who created them
          delete where.userId;

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
        userId: true,
        user: { select: { name: true } },
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
      if (shouldIncludeData) {
        queryOptions.include = { user: { select: { name: true } } };
      } else {
        queryOptions.select = summarySelect;
      }

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

      const access = await getDrawingAccess({
        prisma,
        principal,
        drawingId: id,
      });
      if (!canViewDrawing(access)) {
        if (respondWithAuthErrorIfPresent(req, res)) return;
        return res.status(404).json({
          error: "Drawing not found",
          message: "Drawing does not exist",
        });
      }

      const previewTag = (updatedAt: Date) =>
        `W/"preview-${id}-${updatedAt.getTime()}"`;
      const cacheControl = "private, max-age=0, must-revalidate";
      const ifNoneMatch = req.headers["if-none-match"];
      if (ifNoneMatch) {
        const metadata = await prisma.drawing.findUnique({
          where: { id },
          select: { updatedAt: true },
        });
        if (
          metadata &&
          matchesIfNoneMatch(ifNoneMatch, previewTag(metadata.updatedAt))
        ) {
          res.setHeader("Cache-Control", cacheControl);
          res.setHeader("ETag", previewTag(metadata.updatedAt));
          return res.status(304).end();
        }
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

      res.setHeader("Cache-Control", cacheControl);
      res.setHeader("ETag", previewTag(drawing.updatedAt));
      return res.json({
        preview: drawing.preview ?? null,
        updatedAt: drawing.updatedAt.getTime(),
      });
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

      const userId = req.user.id;
      const sharedDrawings = Prisma.sql`
        FROM "DrawingPermission" p
        JOIN "Drawing" d ON d."id" = p."drawingId"
        JOIN "User" u ON u."id" = d."userId"
        LEFT JOIN "Collection" c ON c."id" = d."collectionId"
        WHERE p."granteeUserId" = ${userId} AND p."hidden" = false
          AND d."userId" <> ${userId}
          AND (
            d."collectionId" IS NULL OR (
              d."collectionId" NOT IN (${LEGACY_TRASH_COLLECTION_ID}, ${TRASH_COLLECTION_PREFIX} || d."userId")
              AND c."id" IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM "CollectionShare" cs
                WHERE cs."collectionId" = c."id" AND cs."granteeUserId" = ${userId}
              )
            )
          )
          ${searchTerm ? Prisma.sql`AND d."name" LIKE ${`%${searchTerm}%`}` : Prisma.empty}
      `;
      const select = shouldIncludeData
        ? Prisma.sql`d.*`
        : Prisma.sql`d."id", d."name", d."version", d."createdAt", d."updatedAt", d."userId"`;
      const sortColumn = Prisma.raw(`d."${parsedSortField}"`);
      const sortOrder =
        parsedSortDirection === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
      type SharedDrawing = Partial<Drawing> & {
        creatorName: string | null;
        permission: string;
      };
      const [drawings, [count]] = await Promise.all([
        prisma.$queryRaw<SharedDrawing[]>`
          SELECT ${select}, u."name" AS "creatorName", p."permission"
          ${sharedDrawings}
          ORDER BY ${sortColumn} ${sortOrder}
          LIMIT ${parsedLimit} OFFSET ${parsedOffset}`,
        prisma.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*) AS "count" ${sharedDrawings}`,
      ]);
      const responsePayload = drawings.map(({ permission, ...drawing }) => {
        const payload = {
          ...drawing,
          collectionId: null,
          accessLevel: normalizeDrawingPermission(permission) ?? "view",
        };
        return shouldIncludeData
          ? {
              ...payload,
              elements: parseJsonField(drawing.elements, []),
              appState: parseJsonField(drawing.appState, {}),
              files: parseJsonField(drawing.files, {}),
            }
          : payload;
      });

      return res.json({
        drawings: responsePayload,
        totalCount: Number(count.count),
        limit: parsedLimit,
        offset: parsedOffset,
      });
    }),
  );
};
