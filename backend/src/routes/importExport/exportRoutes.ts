import { ZipArchive } from "archiver";
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
import {
  embedDrawingFilesForExport,
  MissingBackupImagesError,
} from "./exportFiles";
import { decodeSnapshotPayload } from "../../snapshots/snapshotCodec";

export const registerExcalidashExportRoute = (
  deps: RegisterImportExportDeps,
) => {
  const {
    app,
    prisma,
    requireAuth,
    asyncHandler,
    getBackendVersion,
    parseJsonField,
  } = deps;

  app.get(
    "/export/excalidash",
    requireAuth,
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const trashCollectionId = getUserTrashCollectionId(req.user.id);

      const extParam =
        typeof req.query.ext === "string" ? req.query.ext.toLowerCase() : "";
      const zipSuffix = extParam === "zip";
      const date = new Date().toISOString().split("T")[0];
      const filename = zipSuffix
        ? `excalidash-backup-${date}.excalidash.zip`
        : `excalidash-backup-${date}.excalidash`;

      const exportedAt = new Date().toISOString();
      const drawings = await prisma.drawing.findMany({
        where: { userId: req.user.id },
        include: {
          collection: true,
          snapshots: { orderBy: { createdAt: "asc" } },
        },
      });
      const userCollections = await prisma.collection.findMany({
        where: { userId: req.user.id },
      });

      const hasInternalTrashCollection = userCollections.some(
        (collection) => collection.id === trashCollectionId,
      );
      const normalizedUserCollections = userCollections.filter(
        (collection) =>
          !(hasInternalTrashCollection && collection.id === "trash"),
      );
      const hasTrashDrawings = drawings.some((drawing) =>
        isTrashCollectionId(drawing.collectionId, req.user!.id),
      );
      const collectionsToExport = [...normalizedUserCollections];
      if (
        hasTrashDrawings &&
        !collectionsToExport.some((collection) =>
          isTrashCollectionId(collection.id, req.user!.id),
        )
      ) {
        const trash = await prisma.collection.findFirst({
          where: {
            userId: req.user.id,
            id: { in: [trashCollectionId, "trash"] },
          },
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

      type DrawingWithCollection = Prisma.DrawingGetPayload<{
        include: { collection: true };
      }>;
      const drawingsManifest = drawings.map(
        (drawing: DrawingWithCollection) => {
          const folder = drawing.collectionId
            ? folderByCollectionId.get(drawing.collectionId) ||
              unorganizedFolder
            : unorganizedFolder;
          const fileNameBase = sanitizePathSegment(drawing.name, "Untitled");
          const fileName = `${fileNameBase}__${drawing.id.slice(0, 8)}.excalidraw`;
          return {
            id: drawing.id,
            name: drawing.name,
            filePath: `${folder}/${fileName}`,
            collectionId: toPublicTrashCollectionId(
              drawing.collectionId,
              req.user!.id,
            ),
            version: drawing.version,
            createdAt: drawing.createdAt.toISOString(),
            updatedAt: drawing.updatedAt.toISOString(),
          };
        },
      );

      const manifestCollections = collectionsToExport
        .map((collection) => ({
          id:
            toPublicTrashCollectionId(collection.id, req.user!.id) ||
            collection.id,
          name: isTrashCollectionId(collection.id, req.user!.id)
            ? "Trash"
            : collection.name,
          folder:
            folderByCollectionId.get(collection.id) ||
            sanitizePathSegment(collection.name, "Collection"),
          createdAt: collection.createdAt.toISOString(),
          updatedAt: collection.updatedAt.toISOString(),
        }))
        .filter(
          (collection, index, all) =>
            all.findIndex((c) => c.id === collection.id) === index,
        );

      const recovery = req.query.recovery === "1";
      const missingImages = new Map<
        string,
        { drawingId: string; fileId: string }
      >();
      const manifest = {
        format: "excalidash" as const,
        formatVersion: 1 as const,
        exportedAt,
        excalidashBackendVersion: getBackendVersion(),
        userId: req.user.id,
        unorganizedFolder,
        collections: manifestCollections,
        drawings: drawingsManifest,
        missingImages: [] as { drawingId: string; fileId: string }[],
      };

      // Finish all fallible image bundling before starting the response. A
      // missing managed image must fail the backup, not leave a partial ZIP.
      const exportedFilesByDrawingId = new Map<
        string,
        Record<string, unknown>
      >();
      const historyByDrawingId = new Map<string, unknown[]>();
      try {
        for (const drawing of drawings) {
          const reportMissing = (fileId: string) =>
            missingImages.set(JSON.stringify([drawing.id, fileId]), {
              drawingId: drawing.id,
              fileId,
            });
          const storedFiles = await prisma.drawingFile.findMany({
            where: { drawingId: drawing.id },
            select: {
              fileId: true,
              mimeType: true,
              storage: true,
              s3Key: true,
              data: true,
            },
          });
          const managedDataUrls = new Map<string, string>();
          const liveFiles = await embedDrawingFilesForExport(
            parseJsonField(drawing.files, {} as Record<string, unknown>),
            storedFiles,
            recovery ? reportMissing : undefined,
            managedDataUrls,
          );
          exportedFilesByDrawingId.set(drawing.id, liveFiles);

          // A snapshot can reuse the last inline copy of a file in the same drawing.
          const bundledDataUrls = new Map<string, string>();
          for (const [fileId, file] of Object.entries(liveFiles)) {
            const dataURL = (file as { dataURL?: unknown } | null)?.dataURL;
            if (typeof dataURL === "string" && dataURL.startsWith("data:"))
              bundledDataUrls.set(fileId, dataURL);
          }
          const history = [];
          for (const raw of drawing.snapshots) {
            const snapshot = decodeSnapshotPayload(raw);
            const files = await embedDrawingFilesForExport(
              JSON.parse(snapshot.files),
              storedFiles,
              recovery ? reportMissing : undefined,
              managedDataUrls,
            );
            const sharedFileIds: string[] = [];
            for (const [fileId, file] of Object.entries(files)) {
              if (!file || typeof file !== "object" || Array.isArray(file))
                continue;
              const { dataURL, ...metadata } = file as Record<string, unknown>;
              if (typeof dataURL !== "string" || !dataURL.startsWith("data:"))
                continue;
              if (bundledDataUrls.get(fileId) === dataURL) {
                files[fileId] = metadata;
                sharedFileIds.push(fileId);
              } else {
                bundledDataUrls.set(fileId, dataURL);
              }
            }
            history.push({
              id: snapshot.id,
              version: snapshot.version,
              createdAt: snapshot.createdAt.toISOString(),
              elements: JSON.parse(snapshot.elements),
              appState: JSON.parse(snapshot.appState),
              files,
              ...(sharedFileIds.length ? { sharedFileIds } : {}),
            });
          }
          historyByDrawingId.set(drawing.id, history);
        }
      } catch (error) {
        if (error instanceof MissingBackupImagesError) {
          return res.status(409).json({
            error: "Backup images missing",
            code: "BACKUP_MISSING_IMAGES",
            message:
              "Some drawing images have no stored bytes. Restore the missing image data, or export an incomplete recovery copy to preserve the available drawings and history.",
          });
        }
        throw error;
      }
      manifest.missingImages = [...missingImages.values()];
      for (const meta of drawingsManifest) {
        assertSafeArchivePath(meta.filePath);
      }

      res.setHeader("X-Excalidash-Missing-Images", String(missingImages.size));
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${missingImages.size ? filename.replace("backup-", "recovery-") : filename}"`,
      );

      const archive = new ZipArchive({ zlib: { level: 9 } });
      const abortArchive = () => {
        try {
          archive.abort();
        } catch {}
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

      archive.append(JSON.stringify(manifest, null, 2), {
        name: "excalidash.manifest.json",
      });

      const drawingsManifestById = new Map(
        drawingsManifest.map((d) => [d.id, d]),
      );
      for (const drawing of drawings) {
        const meta = drawingsManifestById.get(drawing.id);
        if (!meta) continue;
        const files = exportedFilesByDrawingId.get(drawing.id)!;
        const excalidashMeta = {
          drawingId: drawing.id,
          collectionId: drawing.collectionId ?? null,
          exportedAt,
          history: historyByDrawingId.get(drawing.id),
        };
        const drawingData = {
          type: "excalidraw" as const,
          version: 2 as const,
          source: exportSource,
          elements: parseJsonField(drawing.elements, [] as unknown[]),
          appState: parseJsonField(
            drawing.appState,
            {} as Record<string, unknown>,
          ),
          files,
          excalidash: excalidashMeta,
        };
        archive.append(JSON.stringify(drawingData, null, 2), {
          name: meta.filePath,
        });
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
History snapshots: ${drawings.reduce((count, drawing) => count + drawing.snapshots.length, 0)}
Missing images: ${missingImages.size}
${missingImages.size ? "WARNING: Some image bytes were already missing from storage. Their original references are preserved, but this backup cannot recover those images. See missingImages in the manifest.\n" : ""}
History is included in each drawing's excalidash.history field. Restore with a version of ExcaliDash that supports backup history; older importers ignore it.
`;
      archive.append(readme, { name: "README.txt" });
      await archive.finalize();
    }),
  );
};
