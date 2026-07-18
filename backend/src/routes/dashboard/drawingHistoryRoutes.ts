import express from "express";
import { canEditDrawing, canViewDrawing, getDrawingAccess } from "../../authz/sharing";
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

      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
      const offset = Math.min(Math.max(parseInt(req.query.offset as string) || 0, 0), 10_000);

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
        elements: parseJsonField(snapshot.elements, []),
        appState: parseJsonField(snapshot.appState, {}),
        files: parseJsonField(snapshot.files, {}),
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

      const expectedVersion = req.body?.version;
      if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
        return res.status(400).json({
          error: "Validation error",
          message: "A current drawing version is required to restore history.",
        });
      }
      const result = await prisma.$transaction(async (tx) => {
        const [drawing, snapshot] = await Promise.all([
          tx.drawing.findUnique({ where: { id } }),
          tx.drawingSnapshot.findFirst({ where: { id: snapshotId, drawingId: id } }),
        ]);
        if (!drawing) return { kind: "missing-drawing" as const };
        if (!snapshot) return { kind: "missing-snapshot" as const };
        const update = await tx.drawing.updateMany({
          where: { id, version: expectedVersion },
          data: { elements: snapshot.elements, appState: snapshot.appState, files: snapshot.files, version: { increment: 1 } },
        });
        if (update.count === 0) return { kind: "conflict" as const };
        // The backup and guarded write commit together, so a conflict cannot
        // leave a stale "current" snapshot behind.
        await tx.drawingSnapshot.create({ data: { drawingId: id, version: drawing.version, elements: drawing.elements, appState: drawing.appState, files: drawing.files } });
        return { kind: "updated" as const, drawing: await tx.drawing.findUniqueOrThrow({ where: { id } }) };
      });
      if (result.kind === "missing-drawing") return res.status(404).json({ error: "Drawing not found" });
      if (result.kind === "missing-snapshot") return res.status(404).json({ error: "Snapshot not found" });
      if (result.kind === "conflict") return res.status(409).json({ error: "Conflict", code: "VERSION_CONFLICT", message: "Drawing has changed since it was loaded for restore." });
      const updated = result.drawing;

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
