import express from "express";
import {
  canEditDrawing,
  canViewDrawing,
  getDrawingAccess,
} from "../../authz/sharing";
import { decodeSnapshotField } from "../../snapshots/snapshotCodec";
import { applySceneUpdateTx, isVersionConflict } from "./sceneUpdate";
import type { DrawingRouteContext } from "./drawingRouteContext";

export const registerDrawingHistoryRoutes = (
  app: express.Express,
  context: DrawingRouteContext,
) => {
  const {
    prisma,
    optionalAuth,
    asyncHandler,
    parseJsonField,
    invalidateDrawingsCache,
    getRequestPrincipal,
    respondWithAuthErrorIfPresent,
  } = context;
  // ============================================================
  // Drawing Version History
  // ============================================================

  // List snapshots (metadata only)
  app.get(
    "/drawings/:id/history",
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
        return res.status(404).json({ error: "Drawing not found" });
      }

      const requestedLimit = Number(req.query.limit ?? 50);
      const offset = Number(req.query.offset ?? 0);
      if (
        !Number.isSafeInteger(requestedLimit) ||
        requestedLimit < 1 ||
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        (req.query.limit !== undefined &&
          typeof req.query.limit !== "string") ||
        (req.query.offset !== undefined && typeof req.query.offset !== "string")
      ) {
        return res.status(400).json({ error: "Invalid history pagination" });
      }
      const limit = Math.min(requestedLimit, 200);

      const [snapshots, totalCount] = await Promise.all([
        prisma.drawingSnapshot.findMany({
          where: { drawingId: id },
          select: { id: true, version: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.drawingSnapshot.count({ where: { drawingId: id } }),
      ]);

      return res.json({ snapshots, totalCount });
    }),
  );

  // Get full snapshot for preview
  app.get(
    "/drawings/:id/history/:snapshotId",
    optionalAuth,
    asyncHandler(async (req, res) => {
      const principal = await getRequestPrincipal(req);
      const { id, snapshotId } = req.params;
      const access = await getDrawingAccess({
        prisma,
        principal,
        drawingId: id,
      });
      if (!canViewDrawing(access)) {
        if (respondWithAuthErrorIfPresent(req, res)) return;
        return res.status(404).json({ error: "Drawing not found" });
      }

      const snapshot = await prisma.drawingSnapshot.findFirst({
        where: { id: snapshotId, drawingId: id },
      });
      if (!snapshot)
        return res.status(404).json({ error: "Snapshot not found" });

      return res.json({
        ...snapshot,
        elements: parseJsonField(decodeSnapshotField(snapshot.elements), []),
        appState: parseJsonField(decodeSnapshotField(snapshot.appState), {}),
        files: parseJsonField(decodeSnapshotField(snapshot.files), {}),
      });
    }),
  );

  // Restore a snapshot (snapshots current state first, then applies old state)
  app.post(
    "/drawings/:id/history/:snapshotId/restore",
    optionalAuth,
    asyncHandler(async (req, res) => {
      const principal = await getRequestPrincipal(req);
      const { id, snapshotId } = req.params;
      const access = await getDrawingAccess({
        prisma,
        principal,
        drawingId: id,
      });
      if (!canEditDrawing(access)) {
        if (respondWithAuthErrorIfPresent(req, res)) return;
        return res.status(404).json({ error: "Drawing not found" });
      }

      const [drawing, snapshot] = await Promise.all([
        prisma.drawing.findUnique({ where: { id } }),
        prisma.drawingSnapshot.findFirst({
          where: { id: snapshotId, drawingId: id },
        }),
      ]);
      if (!drawing) return res.status(404).json({ error: "Drawing not found" });
      if (!snapshot)
        return res.status(404).json({ error: "Snapshot not found" });

      const requestedVersion: unknown = req.body?.version;
      if (
        requestedVersion !== undefined &&
        (typeof requestedVersion !== "number" ||
          !Number.isSafeInteger(requestedVersion) ||
          requestedVersion < 1)
      ) {
        return res.status(400).json({ error: "Invalid drawing version" });
      }
      if (
        requestedVersion !== undefined &&
        requestedVersion !== drawing.version
      ) {
        return res.status(409).json({
          error:
            "Drawing changed since it was loaded. Reload before restoring.",
          code: "VERSION_CONFLICT",
        });
      }

      // Decode before creating the reversible backup. A corrupt compressed
      // snapshot must not mutate history and then fail during the restore.
      const restoredElements = decodeSnapshotField(snapshot.elements);
      const restoredAppState = decodeSnapshotField(snapshot.appState);
      const restoredFiles = decodeSnapshotField(snapshot.files);

      // Share the save path's transaction and version guard: the backup and
      // restore must succeed together, without overwriting a concurrent save.
      let updated;
      try {
        const result = await applySceneUpdateTx({
          prisma,
          drawingId: id,
          parseJsonField,
          versionGuard: drawing.version,
          mutate: () => ({
            data: {
              elements: restoredElements,
              appState: restoredAppState,
              files: restoredFiles,
              preview: null,
            },
          }),
        });
        updated = result.drawing;
      } catch (error) {
        if (isVersionConflict(error)) {
          return res.status(409).json({
            error: "Drawing changed during restore; please try again",
            code: "VERSION_CONFLICT",
          });
        }
        throw error;
      }

      invalidateDrawingsCache();

      return res.json({
        ...updated,
        elements: parseJsonField(updated.elements, []),
        appState: parseJsonField(updated.appState, {}),
        files: parseJsonField(updated.files, {}),
        accessLevel: access,
      });
    }),
  );
};
