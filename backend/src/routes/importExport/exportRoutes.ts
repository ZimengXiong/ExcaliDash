import archiver from "archiver";
import { Prisma } from "../../generated/client";
import {
  RegisterImportExportDeps,
  assertSafeArchivePath,
  getUserTrashCollectionId,
  isTrashCollectionId,
  makeUniqueName,
  sanitizePathSegment,
  toPublicTrashCollectionId,
} from "./shared";

export const registerExcalidashExportRoute = (deps: RegisterImportExportDeps) => {
  const {
    app,
    prisma,
    requireAuth,
    asyncHandler,
    getBackendVersion,
    parseJsonField,
  } = deps;

  app.get("/export/excalidash", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const trashCollectionId = getUserTrashCollectionId(req.user.id);

    const extParam = typeof req.query.ext === "string" ? req.query.ext.toLowerCase() : "";
    const zipSuffix = extParam === "zip";
    const date = new Date().toISOString().split("T")[0];
    const filename = zipSuffix
      ? `excalidash-backup-${date}.excalidash.zip`
      : `excalidash-backup-${date}.excalidash`;

    const exportedAt = new Date().toISOString();
    const drawings = await prisma.drawing.findMany({
      where: { userId: req.user.id },
      include: { collection: true },
    });
    const userCollections = await prisma.collection.findMany({
      where: { userId: req.user.id },
    });

    const hasInternalTrashCollection = userCollections.some((collection) => collection.id === trashCollectionId);
    const normalizedUserCollections = userCollections.filter(
      (collection) => !(hasInternalTrashCollection && collection.id === "trash")
    );
    const hasTrashDrawings = drawings.some((drawing) =>
      isTrashCollectionId(drawing.collectionId, req.user!.id)
    );
    const collectionsToExport = [...normalizedUserCollections];
    if (
      hasTrashDrawings &&
      !collectionsToExport.some((collection) =>
        isTrashCollectionId(collection.id, req.user!.id)
      )
    ) {
      const trash = await prisma.collection.findFirst({
        where: { userId: req.user.id, id: { in: [trashCollectionId, "trash"] } },
      });
      if (trash) collectionsToExport.push(trash);
    }

    const exportSource = `${req.protocol}://${req.get("host")}`;
    const usedFolderNames = new Set<string>();
    const unorganizedFolder = makeUniqueName("Unorganized", usedFolderNames);
    const folderByCollectionId = new Map<string, string>();
    for (const collection of collectionsToExport) {
      const base = sanitizePathSegment(collection.name, "Collection");
      const folder = makeUniqueName(base, usedFolderNames);
      folderByCollectionId.set(collection.id, folder);
    }

    type DrawingWithCollection = Prisma.DrawingGetPayload<{ include: { collection: true } }>;
    const drawingsManifest = drawings.map((drawing: DrawingWithCollection) => {
      const folder = drawing.collectionId
        ? folderByCollectionId.get(drawing.collectionId) || unorganizedFolder
        : unorganizedFolder;
      const fileNameBase = sanitizePathSegment(drawing.name, "Untitled");
      const engine = drawing.engine === "tldraw" ? "tldraw" : "excalidraw";
      const ext = engine === "tldraw" ? "tldraw" : "excalidraw";
      const fileName = `${fileNameBase}__${drawing.id.slice(0, 8)}.${ext}`;
      return {
        id: drawing.id,
        name: drawing.name,
        filePath: `${folder}/${fileName}`,
        engine,
        collectionId: toPublicTrashCollectionId(drawing.collectionId, req.user!.id),
        version: drawing.version,
        createdAt: drawing.createdAt.toISOString(),
        updatedAt: drawing.updatedAt.toISOString(),
      };
    });

    const manifestCollections = collectionsToExport
      .map((collection) => ({
        id: toPublicTrashCollectionId(collection.id, req.user!.id) || collection.id,
        name: isTrashCollectionId(collection.id, req.user!.id) ? "Trash" : collection.name,
        folder: folderByCollectionId.get(collection.id) || sanitizePathSegment(collection.name, "Collection"),
        createdAt: collection.createdAt.toISOString(),
        updatedAt: collection.updatedAt.toISOString(),
      }))
      .filter((collection, index, all) => all.findIndex((c) => c.id === collection.id) === index);

    const manifest = {
      format: "excalidash" as const,
      formatVersion: 1 as const,
      exportedAt,
      excalidashBackendVersion: getBackendVersion(),
      userId: req.user.id,
      unorganizedFolder,
      collections: manifestCollections,
      drawings: drawingsManifest,
    };

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    const abortArchive = () => {
      try {
        archive.abort();
      } catch {
      }
    };

    res.on("close", () => {
      if (res.writableEnded) return;
      abortArchive();
    });

    archive.on("error", (err) => {
      console.error("Archive error:", err);
      abortArchive();

      if (res.headersSent) {
        res.destroy(err instanceof Error ? err : undefined);
        return;
      }
      res.status(500).json({ error: "Failed to create archive" });
    });
    archive.pipe(res);

    archive.append(JSON.stringify(manifest, null, 2), { name: "excalidash.manifest.json" });

    const drawingsManifestById = new Map(drawingsManifest.map((d) => [d.id, d]));
    for (const drawing of drawings) {
      const meta = drawingsManifestById.get(drawing.id);
      if (!meta) continue;
      const excalidashMeta = {
        drawingId: drawing.id,
        collectionId: drawing.collectionId ?? null,
        exportedAt,
      };
      // A tldraw row's `elements` column holds the document object
      // ({ store, schema }), not an excalidraw elements array. Preserve that
      // shape verbatim under `document` so import can round-trip it, instead of
      // stuffing an object into a `type:"excalidraw"` scene's `elements` field.
      const drawingData =
        meta.engine === "tldraw"
          ? {
              type: "tldraw" as const,
              version: 2 as const,
              source: exportSource,
              document: parseJsonField(drawing.elements, {} as Record<string, unknown>),
              appState: parseJsonField(drawing.appState, {} as Record<string, unknown>),
              excalidash: excalidashMeta,
            }
          : {
              type: "excalidraw" as const,
              version: 2 as const,
              source: exportSource,
              elements: parseJsonField(drawing.elements, [] as unknown[]),
              appState: parseJsonField(drawing.appState, {} as Record<string, unknown>),
              files: parseJsonField(drawing.files, {} as Record<string, unknown>),
              excalidash: excalidashMeta,
            };
      assertSafeArchivePath(meta.filePath);
      archive.append(JSON.stringify(drawingData, null, 2), { name: meta.filePath });
    }

    const readme = `ExcaliDash Backup (.excalidash)

This file is a zip archive containing a versioned ExcaliDash manifest and your drawings,
organized into folders by collection.

Files:
- excalidash.manifest.json (required)
- <Collection Folder>/*.excalidraw

ExportedAt: ${exportedAt}
FormatVersion: 1
BackendVersion: ${getBackendVersion()}
Collections: ${collectionsToExport.length}
Drawings: ${drawings.length}
`;
    archive.append(readme, { name: "README.txt" });
    await archive.finalize();
  }));
};
