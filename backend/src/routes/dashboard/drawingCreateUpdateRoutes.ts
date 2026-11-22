import express from "express";
import { v4 as uuidv4 } from "uuid";
import { Prisma } from "../../generated/client";
import {
  canEditDrawing,
  getDrawingAccess,
  isOwnerAccess,
} from "../../authz/sharing";
import { rewritePreviewForInternedFiles } from "../../fileProcessing";
import {
  getUserTrashCollectionId,
  isTrashCollectionId,
  toInternalTrashCollectionId,
  toPublicTrashCollectionId,
} from "./trash";
import type { DrawingRouteContext } from "./drawingRouteContext";
import type { SocketState } from "../../server/socketAccess";
import {
  applySceneUpdateTx,
  countLiveElements,
  isVersionConflict,
} from "./sceneUpdate";
import { collectRetainedDrawingFileIds } from "../storage/retainedFiles";
import {
  prefersMinimalReturn,
  rawJsonArray,
  rawJsonObject,
  sendJsonWithRawFields,
} from "../../utils/rawJson";

// Columns returned to clients that send `Prefer: return=minimal`.
const MINIMAL_RESULT_SELECT = {
  id: true,
  name: true,
  version: true,
  userId: true,
  collectionId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const registerDrawingCreateUpdateRoutes = (
  app: express.Express,
  context: DrawingRouteContext,
) => {
  const {
    prisma,
    requireAuth,
    optionalAuth,
    asyncHandler,
    validateImportedDrawing,
    drawingCreateSchema,
    drawingUpdateSchema,
    respondWithValidationErrors,
    ensureTrashCollection,
    invalidateDrawingsCache,
    config,
    internDrawingFiles,
    parseJsonField,
    getRequestPrincipal,
    respondWithAuthErrorIfPresent,
    revalidateDrawingAccess,
    io,
  } = context;

  // Compensate only failed creation under this request's unpublished UUID.
  // Failed updates keep their tracked rows for version-guarded trim: another
  // editor may be committing references to those bytes at the same time.
  const cleanupUnreferencedInternedFiles = async (
    drawingId: string,
    knownBefore: Set<string>,
    processedFiles: Record<string, unknown> | undefined,
  ): Promise<void> => {
    const candidates = Object.keys(processedFiles ?? {}).filter(
      (fileId) => !knownBefore.has(fileId),
    );
    if (candidates.length === 0) return;
    try {
      await prisma.$transaction(async (tx) => {
        const referenced = await collectRetainedDrawingFileIds(tx, drawingId);
        if (!referenced) return;
        const deletable = candidates.filter(
          (fileId) => !referenced.has(fileId),
        );
        if (deletable.length === 0) return;
        await tx.drawingFile.deleteMany({
          where: { drawingId, fileId: { in: deletable } },
        });
      });
    } catch (cleanupError) {
      // Best-effort: a failed sweep only leaves rows for a later trim pass.
      console.warn("[files] interned-file cleanup failed:", cleanupError);
    }
  };

  const listDrawingFileIds = async (
    drawingId: string,
  ): Promise<Set<string>> => {
    const rows = await prisma.drawingFile.findMany({
      where: { drawingId },
      select: { fileId: true },
    });
    return new Set(rows.map((row) => row.fileId));
  };
  app.post(
    "/drawings",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

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

      const payload = parsed.data as {
        name?: string;
        collectionId?: string | null;
        elements: unknown;
        appState: Record<string, unknown>;
        preview?: string | null;
        files?: Record<string, unknown>;
      };

      const drawingName = payload.name ?? "Untitled Drawing";
      const targetCollectionIdRaw =
        payload.collectionId === undefined ? null : payload.collectionId;
      const targetCollectionId =
        toInternalTrashCollectionId(targetCollectionIdRaw, req.user.id) ?? null;

      if (
        targetCollectionId &&
        !isTrashCollectionId(targetCollectionId, req.user.id)
      ) {
        const collection = await prisma.collection.findFirst({
          where: { id: targetCollectionId },
        });
        if (!collection)
          return res.status(404).json({ error: "Collection not found" });

        if (collection.userId !== req.user.id) {
          if (isTrashCollectionId(collection.id, collection.userId)) {
            return res.status(404).json({ error: "Collection not found" });
          }
          const share = await prisma.collectionShare.findFirst({
            where: {
              collectionId: targetCollectionId,
              granteeUserId: req.user.id,
              role: "edit",
            },
          });
          if (!share)
            return res
              .status(403)
              .json({ error: "No edit access to this collection" });
        }
      } else if (targetCollectionIdRaw === "trash") {
        await ensureTrashCollection(prisma, req.user.id);
      }

      const newDrawingId = uuidv4();
      const originalFiles = payload.files ?? {};
      const knownFileIdsBefore = await listDrawingFileIds(newDrawingId);
      const processedFiles = await internDrawingFiles(
        originalFiles,
        req.user.id,
        newDrawingId,
      );
      const rewritten = rewritePreviewForInternedFiles(
        payload.preview ?? null,
        originalFiles,
        processedFiles,
      );
      const processedPreview: string | null =
        typeof rewritten === "string" ? rewritten : null;

      let newDrawing;
      try {
        newDrawing = await prisma.drawing.create({
          data: {
            id: newDrawingId,
            name: drawingName,
            elements: JSON.stringify(payload.elements),
            appState: JSON.stringify(payload.appState),
            userId: req.user.id,
            collectionId: targetCollectionId,
            preview: processedPreview,
            files: JSON.stringify(processedFiles),
          },
        });
      } catch (error) {
        await cleanupUnreferencedInternedFiles(
          newDrawingId,
          knownFileIdsBefore,
          processedFiles,
        );
        throw error;
      }
      invalidateDrawingsCache();

      const { elements, appState, files, ...meta } = newDrawing;
      return sendJsonWithRawFields(
        res,
        {
          ...meta,
          collectionId: toPublicTrashCollectionId(
            newDrawing.collectionId,
            req.user.id,
          ),
        },
        {
          elements: rawJsonArray(elements),
          appState: rawJsonObject(appState),
          files: rawJsonObject(files),
        },
      );
    }),
  );

  app.put(
    "/drawings/:id",
    optionalAuth,
    asyncHandler(async (req, res) => {
      const principal = await getRequestPrincipal(req);

      const { id } = req.params;
      const access = await getDrawingAccess({
        prisma,
        principal,
        drawingId: id,
      });
      if (!canEditDrawing(access)) {
        if (respondWithAuthErrorIfPresent(req, res)) return;
        return res.status(404).json({
          error: "Drawing not found",
          message: "Drawing does not exist",
        });
      }

      const existingDrawing = await prisma.drawing.findUnique({
        where: { id },
        select: { userId: true, version: true },
      });
      if (!existingDrawing)
        return res.status(404).json({ error: "Drawing not found" });

      const parsed = drawingUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        if (config.nodeEnv === "development") {
          console.error("[API] Validation failed", {
            id,
            errors: parsed.error.issues,
          });
        }
        return respondWithValidationErrors(res, parsed.error.issues);
      }

      const payload = parsed.data as {
        name?: string;
        collectionId?: string | null;
        elements?: unknown;
        appState?: Record<string, unknown>;
        preview?: string | null;
        files?: Record<string, unknown>;
        version?: number;
        expectedVersion?: number;
      };

      const ownerUserId = existingDrawing.userId;
      const actingUserId =
        principal?.kind === "user" ? principal.userId : ownerUserId;
      const trashCollectionId = getUserTrashCollectionId(ownerUserId);
      const isSceneUpdate =
        payload.elements !== undefined ||
        payload.appState !== undefined ||
        payload.files !== undefined;

      if (
        isSceneUpdate &&
        payload.version !== undefined &&
        payload.version !== existingDrawing.version
      ) {
        return res.status(409).json({
          error: "Conflict",
          code: "VERSION_CONFLICT",
          message: "Drawing has changed since this editor state was loaded.",
          currentVersion: existingDrawing.version,
        });
      }
      // `version` is owned by applySceneUpdateTx for scene updates; do not set
      // it here.
      const data: Prisma.DrawingUpdateInput = {};

      if (payload.name !== undefined) data.name = payload.name;
      if (payload.elements !== undefined)
        data.elements = JSON.stringify(payload.elements);
      if (payload.appState !== undefined)
        data.appState = JSON.stringify(payload.appState);
      let processedFilesForUpdate: Record<string, unknown> | undefined;
      let requiredFileIdsForUpdate: string[] | undefined;
      let knownFileIdsBeforeUpdate: Set<string> | null = null;
      if (payload.files !== undefined) {
        knownFileIdsBeforeUpdate = await listDrawingFileIds(id);
        processedFilesForUpdate = await internDrawingFiles(
          payload.files,
          ownerUserId,
          id,
        );
        requiredFileIdsForUpdate = Object.entries(processedFilesForUpdate)
          .filter(([fileId, file]) => {
            const processedUrl = (file as { dataURL?: unknown } | null)
              ?.dataURL;
            const originalUrl = (
              payload.files?.[fileId] as { dataURL?: unknown } | null
            )?.dataURL;
            return (
              knownFileIdsBeforeUpdate!.has(fileId) ||
              processedUrl === `/api/files/${id}/${fileId}` ||
              (typeof originalUrl === "string" &&
                originalUrl.startsWith("data:") &&
                typeof processedUrl === "string" &&
                processedUrl !== originalUrl)
            );
          })
          .map(([fileId]) => fileId);
        // Note: data.files is not assigned here. The union merge with the
        // authoritative current state happens inside the transaction so a
        // concurrent client's files are never whole-replaced away.
      }
      if (payload.preview !== undefined) {
        const processedPreview: unknown = processedFilesForUpdate
          ? rewritePreviewForInternedFiles(
              payload.preview,
              payload.files ?? {},
              processedFilesForUpdate,
            )
          : payload.preview;
        data.preview =
          typeof processedPreview === "string" ? processedPreview : null;
      }

      if (payload.collectionId !== undefined) {
        if (!isOwnerAccess(access)) {
          return res.status(403).json({
            error: "Forbidden",
            message: "Only the owner can move drawings between collections",
          });
        }
        if (payload.collectionId === "trash") {
          await ensureTrashCollection(prisma, ownerUserId);
          (data as Prisma.DrawingUncheckedUpdateInput).collectionId =
            trashCollectionId;
        } else if (payload.collectionId) {
          const ownedCollection = await prisma.collection.findFirst({
            where: { id: payload.collectionId, userId: actingUserId },
          });
          if (!ownedCollection) {
            const editableShare = await prisma.collectionShare.findFirst({
              where: {
                collectionId: payload.collectionId,
                granteeUserId: actingUserId,
                role: "edit",
              },
              select: {
                id: true,
                collection: { select: { id: true, userId: true } },
              },
            });
            if (
              !editableShare ||
              isTrashCollectionId(
                editableShare.collection.id,
                editableShare.collection.userId,
              )
            ) {
              return res.status(404).json({ error: "Collection not found" });
            }
          }
          (data as Prisma.DrawingUncheckedUpdateInput).collectionId =
            payload.collectionId;
        } else {
          (data as Prisma.DrawingUncheckedUpdateInput).collectionId = null;
        }
      }

      const minimal = prefersMinimalReturn(req);
      const snapshotMinIntervalMs = config.snapshotMinIntervalMs ?? 0;
      type SceneUpdate = Awaited<ReturnType<typeof applySceneUpdateTx>>;
      let updatedDrawing: SceneUpdate["drawing"] | null = null;
      let savedScene: SceneUpdate["scene"] | undefined;

      try {
        if (isSceneUpdate) {
          const result = await applySceneUpdateTx({
            prisma,
            drawingId: id,
            parseJsonField,
            versionGuard:
              payload.version !== undefined ? payload.version : "optimistic",
            maxRetries: payload.version === undefined ? 2 : 0,
            mutate: () => ({
              data,
              incomingFiles: processedFilesForUpdate,
              requiredFileIds: requiredFileIdsForUpdate,
            }),
            resultSelect: minimal ? MINIMAL_RESULT_SELECT : undefined,
            snapshotCoalescing:
              snapshotMinIntervalMs > 0
                ? {
                    minIntervalMs: snapshotMinIntervalMs,
                    incomingLiveCount:
                      payload.elements !== undefined
                        ? countLiveElements(payload.elements)
                        : undefined,
                  }
                : undefined,
          });
          updatedDrawing = result.drawing;
          savedScene = result.scene;
        } else {
          const expectedVersion =
            payload.preview === undefined ? undefined : payload.expectedVersion;
          const updateResult = await prisma.drawing.updateMany({
            where: { id, version: expectedVersion },
            data,
          });
          if (updateResult.count === 0) {
            if (expectedVersion !== undefined) {
              const current = await prisma.drawing.findUnique({
                where: { id },
                select: { id: true, version: true, updatedAt: true },
              });
              if (current) return res.json({ ...current, skipped: true });
            }
            return res.status(404).json({ error: "Drawing not found" });
          }
          if (payload.collectionId !== undefined) {
            try {
              await revalidateDrawingAccess?.(id);
            } catch (err) {
              console.error("Failed to revalidate live drawing access:", err);
            }
          }
          updatedDrawing = await prisma.drawing.findFirst({
            where: { id },
            ...(minimal ? { select: MINIMAL_RESULT_SELECT } : {}),
          });
        }
      } catch (error) {
        // Do not reclaim interned rows here. Under PostgreSQL READ COMMITTED,
        // a concurrent valid save may have checked these rows without having
        // committed its scene yet. Guarded trim reclaims unused rows and their
        // exact S3 generations after owning the drawing's version update.
        if (isVersionConflict(error)) {
          const latestDrawing = await prisma.drawing.findFirst({
            where: { id },
            select: { version: true },
          });
          if (isSceneUpdate) {
            return res.status(409).json({
              error: "Conflict",
              code: "VERSION_CONFLICT",
              message:
                "Drawing has changed since this editor state was loaded.",
              currentVersion: latestDrawing?.version ?? null,
            });
          }
        }
        throw error;
      }
      if (!updatedDrawing) {
        return res.status(404).json({ error: "Drawing not found" });
      }
      invalidateDrawingsCache();

      // Revalidate after access-changing moves and before each saved-scene
      // broadcast so a passive listener cannot keep access after revocation.
      if (savedScene && revalidateDrawingAccess) {
        try {
          await revalidateDrawingAccess(id);
        } catch (err) {
          console.error("Failed to revalidate live drawing access:", err);
          savedScene = undefined;
        }
      }

      if (savedScene && io) {
        const roomId = `drawing_${id}`;
        const rooms = io.sockets?.adapter?.rooms;
        const roomSockets = rooms?.get(roomId);
        const rawSocketId = req.headers["x-socket-id"];
        const senderSocket =
          typeof rawSocketId === "string" && roomSockets?.has(rawSocketId)
            ? io.sockets.sockets?.get(rawSocketId)
            : undefined;
        const socketState = senderSocket?.data as
          Partial<SocketState> | undefined;
        // A header alone cannot prove ownership of a socket. With anonymous
        // saves, broadcast to the entire room.
        const senderSocketId =
          principal && socketState?.principal?.userId === principal.userId
            ? senderSocket?.id
            : undefined;
        const listenerCount =
          (roomSockets?.size ?? 0) - (senderSocketId ? 1 : 0);
        if (!rooms || listenerCount > 0) {
          // A peer can join after the realtime delta but before this autosave.
          // Deliver the committed scene so that edit is eventually received.
          const elements = parseJsonField<unknown>(savedScene.elements, []);
          const savedElements = Array.isArray(elements) ? elements : [];
          const room = io.to(roomId);
          (senderSocketId ? room.except(senderSocketId) : room).emit(
            "element-update",
            {
              drawingId: id,
              persisted: true,
              version: updatedDrawing.version,
              elements: savedElements,
              appState: parseJsonField(savedScene.appState, {}),
              files: parseJsonField(savedScene.files, {}),
              elementOrder: savedElements
                .map((element: { id?: unknown } | null) => element?.id)
                .filter((elementId: unknown) => typeof elementId === "string"),
            },
          );
        }
      }

      // Cheap validator so Express does not hash a multi-MB body.
      res.setHeader(
        "ETag",
        `W/"drawing-${id}-${updatedDrawing.version}-${updatedDrawing.updatedAt.getTime()}"`,
      );
      const collectionId = toPublicTrashCollectionId(
        updatedDrawing.collectionId ?? null,
        ownerUserId,
      );
      if (minimal) {
        return res.json({
          ...updatedDrawing,
          collectionId,
          accessLevel: access,
        });
      }
      const { elements, appState, files, ...meta } = updatedDrawing;
      return sendJsonWithRawFields(
        res,
        { ...meta, collectionId, accessLevel: access },
        {
          elements: rawJsonArray(elements),
          appState: rawJsonObject(appState),
          files: rawJsonObject(files),
        },
      );
    }),
  );
};
