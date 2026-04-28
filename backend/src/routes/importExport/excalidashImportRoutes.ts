import { promises as fsPromises } from "fs";
import path from "path";
import JSZip from "jszip";
import { v4 as uuidv4 } from "uuid";
import {
  RegisterImportExportDeps,
  ImportValidationError,
  assertSafeZipArchive,
  excalidashManifestSchemaV1,
  findFirstDuplicate,
  getSafeZipEntry,
  getUserTrashCollectionId,
  sanitizeDrawingData,
} from "./shared";
import { processFilesForS3 } from "../../fileProcessing";

const isSafeMulterTempFilename = (value: string): boolean => /^[a-f0-9]{32}$/.test(value);

const resolveStagedUploadPath = async (
  file: { filename?: unknown; path?: unknown },
  uploadRoot: string
): Promise<string> => {
  const absoluteUploadRoot = path.resolve(uploadRoot);

  let canonicalUploadRoot = absoluteUploadRoot;
  try {
    canonicalUploadRoot = await fsPromises.realpath(absoluteUploadRoot);
  } catch {
    throw new ImportValidationError("Invalid upload path");
  }

  // CodeQL path-injection: use basename extraction + strict allowlist, then enforce root containment.
  // Multer typically generates a server-side random filename; we still validate defensively.
  const rawPath = typeof file.path === "string" ? file.path : "";
  const rawFilename = typeof file.filename === "string" ? file.filename : "";
  const basename = path.basename(rawPath || rawFilename);
  if (!isSafeMulterTempFilename(basename)) {
    throw new ImportValidationError("Invalid upload path");
  }

  const candidatePath = path.resolve(canonicalUploadRoot, basename);
  const rootPrefix = canonicalUploadRoot.endsWith(path.sep)
    ? canonicalUploadRoot
    : `${canonicalUploadRoot}${path.sep}`;
  if (!candidatePath.startsWith(rootPrefix)) {
    throw new ImportValidationError("Invalid upload path");
  }

  return candidatePath;
};

export const registerExcalidashImportRoutes = (deps: RegisterImportExportDeps) => {
  const {
    app,
    prisma,
    requireAuth,
    asyncHandler,
    upload,
    uploadDir,
    sanitizeText,
    validateImportedDrawing,
    ensureTrashCollection,
    invalidateDrawingsCache,
    removeFileIfExists,
    MAX_IMPORT_ARCHIVE_ENTRIES,
    MAX_IMPORT_COLLECTIONS,
    MAX_IMPORT_DRAWINGS,
    MAX_IMPORT_MANIFEST_BYTES,
    MAX_IMPORT_DRAWING_BYTES,
    MAX_IMPORT_TOTAL_EXTRACTED_BYTES,
  } = deps;

  app.post("/import/excalidash/verify", requireAuth, upload.single("archive"), asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    let stagedPath: string;
    try {
      stagedPath = await resolveStagedUploadPath({ filename: req.file.filename }, uploadDir);
    } catch (error) {
      if (error instanceof ImportValidationError) {
        return res.status(error.status).json({ error: "Invalid upload", message: error.message });
      }
      throw error;
    }
    try {
      const buffer = await fsPromises.readFile(stagedPath);
      const zip = await JSZip.loadAsync(buffer);
      try {
        assertSafeZipArchive(zip, MAX_IMPORT_ARCHIVE_ENTRIES);
      } catch (error) {
        if (error instanceof ImportValidationError) {
          return res.status(error.status).json({ error: "Invalid backup", message: error.message });
        }
        throw error;
      }

      const manifestFile = getSafeZipEntry(zip, "excalidash.manifest.json");
      if (!manifestFile) {
        return res.status(400).json({ error: "Invalid backup", message: "Missing excalidash.manifest.json" });
      }
      const rawManifest = await manifestFile.async("string");
      if (Buffer.byteLength(rawManifest, "utf8") > MAX_IMPORT_MANIFEST_BYTES) {
        return res.status(400).json({
          error: "Invalid backup manifest",
          message: "excalidash.manifest.json is too large",
        });
      }

      let manifestJson: unknown;
      try {
        manifestJson = JSON.parse(rawManifest);
      } catch {
        return res.status(400).json({
          error: "Invalid backup manifest",
          message: "excalidash.manifest.json is not valid JSON",
        });
      }
      const parsed = excalidashManifestSchemaV1.safeParse(manifestJson);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid backup manifest",
          message: "Malformed excalidash.manifest.json",
        });
      }
      const manifest = parsed.data;
      if (manifest.collections.length > MAX_IMPORT_COLLECTIONS) {
        return res.status(400).json({
          error: "Invalid backup manifest",
          message: `Too many collections (max ${MAX_IMPORT_COLLECTIONS})`,
        });
      }
      if (manifest.drawings.length > MAX_IMPORT_DRAWINGS) {
        return res.status(400).json({
          error: "Invalid backup manifest",
          message: `Too many drawings (max ${MAX_IMPORT_DRAWINGS})`,
        });
      }

      const duplicateCollectionId = findFirstDuplicate(manifest.collections.map((c) => c.id));
      if (duplicateCollectionId) {
        return res.status(400).json({
          error: "Invalid backup manifest",
          message: `Duplicate collection id in manifest: ${duplicateCollectionId}`,
        });
      }
      const duplicateDrawingId = findFirstDuplicate(manifest.drawings.map((d) => d.id));
      if (duplicateDrawingId) {
        return res.status(400).json({
          error: "Invalid backup manifest",
          message: `Duplicate drawing id in manifest: ${duplicateDrawingId}`,
        });
      }
      const duplicateDrawingPath = findFirstDuplicate(manifest.drawings.map((d) => d.filePath));
      if (duplicateDrawingPath) {
        return res.status(400).json({
          error: "Invalid backup manifest",
          message: `Duplicate drawing file path in manifest: ${duplicateDrawingPath}`,
        });
      }
      for (const drawing of manifest.drawings) {
        if (!getSafeZipEntry(zip, drawing.filePath)) {
          return res.status(400).json({
            error: "Invalid backup",
            message: `Missing drawing file: ${drawing.filePath}`,
          });
        }
      }

      return res.json({
        valid: true,
        formatVersion: manifest.formatVersion,
        exportedAt: manifest.exportedAt,
        excalidashBackendVersion: manifest.excalidashBackendVersion || null,
        collections: manifest.collections.length,
        drawings: manifest.drawings.length,
      });
    } finally {
      await removeFileIfExists(stagedPath);
    }
  }));

  app.post("/import/excalidash", requireAuth, upload.single("archive"), asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    let stagedPath: string;
    try {
      stagedPath = await resolveStagedUploadPath({ filename: req.file.filename }, uploadDir);
    } catch (error) {
      if (error instanceof ImportValidationError) {
        return res.status(error.status).json({ error: "Invalid upload", message: error.message });
      }
      throw error;
    }
    try {
      const buffer = await fsPromises.readFile(stagedPath);
      const zip = await JSZip.loadAsync(buffer);
      try {
        assertSafeZipArchive(zip, MAX_IMPORT_ARCHIVE_ENTRIES);
      } catch (error) {
        if (error instanceof ImportValidationError) {
          return res.status(error.status).json({ error: "Invalid backup", message: error.message });
        }
        throw error;
      }

      const manifestFile = getSafeZipEntry(zip, "excalidash.manifest.json");
      if (!manifestFile) {
        return res.status(400).json({ error: "Invalid backup", message: "Missing excalidash.manifest.json" });
      }
      const rawManifest = await manifestFile.async("string");
      if (Buffer.byteLength(rawManifest, "utf8") > MAX_IMPORT_MANIFEST_BYTES) {
        return res.status(400).json({
          error: "Invalid backup manifest",
          message: "excalidash.manifest.json is too large",
        });
      }

      let manifestJson: unknown;
      try {
        manifestJson = JSON.parse(rawManifest);
      } catch {
        return res.status(400).json({
          error: "Invalid backup manifest",
          message: "excalidash.manifest.json is not valid JSON",
        });
      }
      const parsed = excalidashManifestSchemaV1.safeParse(manifestJson);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid backup manifest",
          message: "Malformed excalidash.manifest.json",
        });
      }
      const manifest = parsed.data;

      if (manifest.collections.length > MAX_IMPORT_COLLECTIONS) {
        return res.status(400).json({
          error: "Invalid backup manifest",
          message: `Too many collections (max ${MAX_IMPORT_COLLECTIONS})`,
        });
      }
      if (manifest.drawings.length > MAX_IMPORT_DRAWINGS) {
        return res.status(400).json({
          error: "Invalid backup manifest",
          message: `Too many drawings (max ${MAX_IMPORT_DRAWINGS})`,
        });
      }

      const duplicateCollectionId = findFirstDuplicate(manifest.collections.map((c) => c.id));
      if (duplicateCollectionId) {
        return res.status(400).json({
          error: "Invalid backup manifest",
          message: `Duplicate collection id in manifest: ${duplicateCollectionId}`,
        });
      }
      const duplicateDrawingId = findFirstDuplicate(manifest.drawings.map((d) => d.id));
      if (duplicateDrawingId) {
        return res.status(400).json({
          error: "Invalid backup manifest",
          message: `Duplicate drawing id in manifest: ${duplicateDrawingId}`,
        });
      }
      const duplicateDrawingPath = findFirstDuplicate(manifest.drawings.map((d) => d.filePath));
      if (duplicateDrawingPath) {
        return res.status(400).json({
          error: "Invalid backup manifest",
          message: `Duplicate drawing file path in manifest: ${duplicateDrawingPath}`,
        });
      }

      type PreparedImportDrawing = {
        id: string;
        name: string;
        version: number | undefined;
        collectionId: string | null;
        sanitized: ReturnType<typeof sanitizeDrawingData>;
      };
      const preparedDrawings: PreparedImportDrawing[] = [];
      let extractedBytes = Buffer.byteLength(rawManifest, "utf8");
      try {
        for (const d of manifest.drawings) {
          const entry = getSafeZipEntry(zip, d.filePath);
          if (!entry) throw new ImportValidationError(`Missing drawing file: ${d.filePath}`);

          const raw = await entry.async("string");
          const rawSize = Buffer.byteLength(raw, "utf8");
          if (rawSize > MAX_IMPORT_DRAWING_BYTES) {
            throw new ImportValidationError(`Drawing is too large: ${d.filePath}`);
          }
          extractedBytes += rawSize;
          if (extractedBytes > MAX_IMPORT_TOTAL_EXTRACTED_BYTES) {
            throw new ImportValidationError("Backup contents exceed maximum import size");
          }

          let parsedJson: any;
          try {
            parsedJson = JSON.parse(raw) as any;
          } catch {
            throw new ImportValidationError(`Drawing JSON is invalid: ${d.filePath}`);
          }

          const imported = {
            name: d.name,
            elements: Array.isArray(parsedJson?.elements) ? parsedJson.elements : [],
            appState:
              typeof parsedJson?.appState === "object" && parsedJson.appState !== null
                ? parsedJson.appState
                : {},
            files:
              typeof parsedJson?.files === "object" && parsedJson.files !== null
                ? parsedJson.files
                : {},
            preview: null as string | null,
            collectionId: d.collectionId,
          };

          if (!validateImportedDrawing(imported)) {
            throw new ImportValidationError(`Drawing failed validation: ${d.filePath}`);
          }

          preparedDrawings.push({
            id: d.id,
            name: sanitizeText(imported.name, 255) || "Untitled Drawing",
            version: typeof d.version === "number" ? d.version : undefined,
            collectionId: d.collectionId,
            sanitized: sanitizeDrawingData(imported),
          });
        }
      } catch (error) {
        if (error instanceof ImportValidationError) {
          return res.status(error.status).json({ error: "Invalid backup", message: error.message });
        }
        throw error;
      }

      // Process files for S3 upload before entering the transaction
      const processedFilesMap = new Map<number, Record<string, any>>();
      for (let i = 0; i < preparedDrawings.length; i++) {
        const prepared = preparedDrawings[i];
        const files = prepared.sanitized.files || {};
        processedFilesMap.set(
          i,
          await processFilesForS3(files, req.user!.id, prepared.id, prisma),
        );
      }

      const result = await prisma.$transaction(async (tx) => {
        const trashCollectionId = getUserTrashCollectionId(req.user!.id);
        const collectionIdMap = new Map<string, string>();
        let collectionsCreated = 0;
        let collectionsUpdated = 0;
        let collectionIdConflicts = 0;
        let drawingsCreated = 0;
        let drawingsUpdated = 0;
        let drawingIdConflicts = 0;

        const needsTrash =
          manifest.collections.some((c) => c.id === "trash") ||
          preparedDrawings.some((d) => d.collectionId === "trash");
        if (needsTrash) await ensureTrashCollection(tx, req.user!.id);

        for (const c of manifest.collections) {
          if (c.id === "trash") {
            collectionIdMap.set("trash", trashCollectionId);
            continue;
          }

          const existing = await tx.collection.findUnique({ where: { id: c.id } });
          if (!existing) {
            await tx.collection.create({
              data: { id: c.id, name: sanitizeText(c.name, 100) || "Collection", userId: req.user!.id },
            });
            collectionIdMap.set(c.id, c.id);
            collectionsCreated += 1;
            continue;
          }

          if (existing.userId === req.user!.id) {
            await tx.collection.update({
              where: { id: c.id },
              data: { name: sanitizeText(c.name, 100) || "Collection" },
            });
            collectionIdMap.set(c.id, c.id);
            collectionsUpdated += 1;
            continue;
          }

          const newId = uuidv4();
          await tx.collection.create({
            data: { id: newId, name: sanitizeText(c.name, 100) || "Collection", userId: req.user!.id },
          });
          collectionIdMap.set(c.id, newId);
          collectionsCreated += 1;
          collectionIdConflicts += 1;
        }

        const resolveCollectionId = (collectionId: string | null): string | null => {
          if (!collectionId) return null;
          if (collectionId === "trash") return trashCollectionId;
          return collectionIdMap.get(collectionId) || null;
        };

        for (let i = 0; i < preparedDrawings.length; i++) {
          const prepared = preparedDrawings[i];
          const processedFiles = processedFilesMap.get(i) ?? {};
          const targetCollectionId = resolveCollectionId(prepared.collectionId);
          const existing = await tx.drawing.findUnique({ where: { id: prepared.id } });
          if (!existing) {
            await tx.drawing.create({
              data: {
                id: prepared.id,
                name: prepared.name,
                elements: JSON.stringify(prepared.sanitized.elements),
                appState: JSON.stringify(prepared.sanitized.appState),
                files: JSON.stringify(processedFiles),
                preview: prepared.sanitized.preview ?? null,
                version: prepared.version ?? 1,
                userId: req.user!.id,
                collectionId: targetCollectionId,
              },
            });
            drawingsCreated += 1;
            continue;
          }

          if (existing.userId === req.user!.id) {
            await tx.drawing.update({
              where: { id: prepared.id },
              data: {
                name: prepared.name,
                elements: JSON.stringify(prepared.sanitized.elements),
                appState: JSON.stringify(prepared.sanitized.appState),
                files: JSON.stringify(processedFiles),
                preview: prepared.sanitized.preview ?? null,
                version: prepared.version ?? existing.version,
                collectionId: targetCollectionId,
              },
            });
            drawingsUpdated += 1;
            continue;
          }

          const newId = uuidv4();
          await tx.drawing.create({
            data: {
              id: newId,
              name: prepared.name,
              elements: JSON.stringify(prepared.sanitized.elements),
              appState: JSON.stringify(prepared.sanitized.appState),
              files: JSON.stringify(processedFiles),
              preview: prepared.sanitized.preview ?? null,
              version: prepared.version ?? 1,
              userId: req.user!.id,
              collectionId: targetCollectionId,
            },
          });
          drawingsCreated += 1;
          drawingIdConflicts += 1;
        }

        return {
          collections: { created: collectionsCreated, updated: collectionsUpdated, idConflicts: collectionIdConflicts },
          drawings: { created: drawingsCreated, updated: drawingsUpdated, idConflicts: drawingIdConflicts },
        };
      });

      invalidateDrawingsCache();
      return res.json({ success: true, message: "Backup imported successfully", ...result });
    } finally {
      await removeFileIfExists(stagedPath);
    }
  }));
};
