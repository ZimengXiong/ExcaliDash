import { promises as fsPromises } from "fs";
import path from "path";
import JSZip from "jszip";
import { v4 as uuidv4 } from "uuid";
import {
  RegisterImportExportDeps,
  ImportValidationError,
  assertSafeZipArchive,
  assertImportedScene,
  replaceImportedDrawing,
  getRequiredImportedFileIds,
  assertImportedFilesAvailable,
  excalidashManifestSchemaV1,
  backupHistorySchema,
  findFirstDuplicate,
  getSafeZipEntry,
  getUserTrashCollectionId,
  sanitizeDrawingData,
} from "./shared";
import { internDrawingFiles } from "../../fileProcessing";
import { encodeSnapshotField } from "../../snapshots/snapshotCodec";
const isSafeMulterTempFilename = (value: string): boolean =>
  /^[a-f0-9]{32}$/.test(value);
const getInlineFileIds = (
  files: Record<string, { dataURL?: unknown } | null>,
): string[] =>
  Object.keys(files).filter((fileId) => {
    const dataURL = files[fileId]?.dataURL;
    return typeof dataURL === "string" && dataURL.startsWith("data:");
  });

const readDrawingEntry = (
  entry: JSZip.JSZipObject,
  maxBytes: number,
  limitMessage: string,
  verifyOnly: boolean,
) =>
  new Promise<{ raw: string; size: number }>((resolve, reject) => {
    const stream = entry.nodeStream();
    const chunks: Buffer[] = [];
    let size = 0;
    stream.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        stream.pause();
        reject(new ImportValidationError(limitMessage));
        return;
      }
      if (!verifyOnly) chunks.push(chunk);
    });
    stream.once("error", reject);
    stream.once("end", () => {
      resolve({ raw: Buffer.concat(chunks).toString("utf8"), size });
    });
  });

const resolveStagedUploadPath = async (
  file: { filename?: unknown; path?: unknown },
  uploadRoot: string,
): Promise<string> => {
  const absoluteUploadRoot = path.resolve(uploadRoot);
  let canonicalUploadRoot = absoluteUploadRoot;
  try {
    canonicalUploadRoot = await fsPromises.realpath(absoluteUploadRoot);
  } catch {
    throw new ImportValidationError("Invalid upload path");
  }
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
export const registerExcalidashImportRoutes = (
  deps: RegisterImportExportDeps,
) => {
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
  const importArchive = (verifyOnly: boolean) =>
    asyncHandler(async (req, res) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      let stagedPath: string;
      try {
        stagedPath = await resolveStagedUploadPath(
          { filename: req.file.filename },
          uploadDir,
        );
      } catch (error) {
        if (error instanceof ImportValidationError) {
          return res
            .status(error.status)
            .json({ error: "Invalid upload", message: error.message });
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
            return res
              .status(error.status)
              .json({ error: "Invalid backup", message: error.message });
          }
          throw error;
        }
        const manifestFile = getSafeZipEntry(zip, "excalidash.manifest.json");
        if (!manifestFile) {
          return res.status(400).json({
            error: "Invalid backup",
            message: "Missing excalidash.manifest.json",
          });
        }
        const rawManifest = await manifestFile.async("string");
        if (
          Buffer.byteLength(rawManifest, "utf8") > MAX_IMPORT_MANIFEST_BYTES
        ) {
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
        const duplicateCollectionId = findFirstDuplicate(
          manifest.collections.map((c) => c.id),
        );
        if (duplicateCollectionId) {
          return res.status(400).json({
            error: "Invalid backup manifest",
            message: `Duplicate collection id in manifest: ${duplicateCollectionId}`,
          });
        }
        const duplicateDrawingId = findFirstDuplicate(
          manifest.drawings.map((d) => d.id),
        );
        if (duplicateDrawingId) {
          return res.status(400).json({
            error: "Invalid backup manifest",
            message: `Duplicate drawing id in manifest: ${duplicateDrawingId}`,
          });
        }
        const duplicateDrawingPath = findFirstDuplicate(
          manifest.drawings.map((d) => d.filePath),
        );
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
          sanitized: ReturnType<typeof sanitizeDrawingData> | null;
          history: Array<{
            id: string;
            version: number;
            createdAt: string;
            sanitized: ReturnType<typeof sanitizeDrawingData>;
            sharedFileIds: string[];
          }>;
          missingFileIds: Set<string>;
        };
        const preparedDrawings: PreparedImportDrawing[] = [];
        let extractedBytes = Buffer.byteLength(rawManifest, "utf8");
        try {
          for (const d of manifest.drawings) {
            const entry = getSafeZipEntry(zip, d.filePath);
            if (!entry)
              throw new ImportValidationError(
                `Missing drawing file: ${d.filePath}`,
              );
            const remainingBytes =
              MAX_IMPORT_TOTAL_EXTRACTED_BYTES - extractedBytes;
            const { raw, size } = await readDrawingEntry(
              entry,
              Math.min(MAX_IMPORT_DRAWING_BYTES, remainingBytes),
              MAX_IMPORT_DRAWING_BYTES <= remainingBytes
                ? `Drawing is too large: ${d.filePath}`
                : "Backup contents exceed maximum import size",
              verifyOnly,
            );
            extractedBytes += size;
            if (verifyOnly) continue;
            let parsedJson: any;
            try {
              parsedJson = JSON.parse(raw) as any;
            } catch {
              throw new ImportValidationError(
                `Drawing JSON is invalid: ${d.filePath}`,
              );
            }
            const imported = {
              name: d.name,
              elements: parsedJson?.elements,
              appState:
                parsedJson?.appState === undefined ? {} : parsedJson.appState,
              files: parsedJson?.files === undefined ? {} : parsedJson.files,
              preview: null as string | null,
              collectionId: d.collectionId,
            };
            assertImportedScene(imported);
            if (!validateImportedDrawing(imported)) {
              throw new ImportValidationError(
                `Drawing failed validation: ${d.filePath}`,
              );
            }
            const historyResult = backupHistorySchema.safeParse(
              parsedJson?.excalidash?.history ?? [],
            );
            if (!historyResult.success)
              throw new ImportValidationError(
                `Invalid drawing history: ${d.filePath}`,
              );
            if (
              findFirstDuplicate(
                historyResult.data.map((snapshot) => snapshot.id),
              )
            )
              throw new ImportValidationError(
                `Duplicate snapshot ID: ${d.filePath}`,
              );
            const sanitized = sanitizeDrawingData(imported);
            const bundledFileIds = new Set(getInlineFileIds(sanitized.files));
            const history = historyResult.data.map((snapshot) => {
              assertImportedScene(snapshot);
              if (!validateImportedDrawing(snapshot))
                throw new ImportValidationError(
                  `Invalid historical scene: ${d.filePath}`,
                );
              const sanitizedSnapshot = sanitizeDrawingData(snapshot);
              const sharedFileIds = snapshot.sharedFileIds ?? [];
              for (const fileId of sharedFileIds) {
                const file = sanitizedSnapshot.files[fileId];
                if (
                  !bundledFileIds.has(fileId) ||
                  !Object.hasOwn(sanitizedSnapshot.files, fileId) ||
                  !file ||
                  typeof file !== "object" ||
                  Array.isArray(file) ||
                  Object.hasOwn(file, "dataURL")
                ) {
                  throw new ImportValidationError(
                    `Invalid shared history image: ${d.filePath}`,
                  );
                }
              }
              for (const fileId of getInlineFileIds(sanitizedSnapshot.files))
                bundledFileIds.add(fileId);
              return {
                id: snapshot.id,
                version: snapshot.version,
                createdAt: snapshot.createdAt,
                sanitized: sanitizedSnapshot,
                sharedFileIds,
              };
            });
            preparedDrawings.push({
              id: d.id,
              name: sanitizeText(imported.name, 255) || "Untitled Drawing",
              version: typeof d.version === "number" ? d.version : undefined,
              collectionId: d.collectionId,
              sanitized,
              history,
              missingFileIds: new Set(
                (manifest.missingImages ?? [])
                  .filter((image) => image.drawingId === d.id)
                  .map((image) => image.fileId),
              ),
            });
          }
        } catch (error) {
          if (error instanceof ImportValidationError) {
            return res
              .status(error.status)
              .json({ error: "Invalid backup", message: error.message });
          }
          throw error;
        }
        if (verifyOnly) {
          return res.json({
            valid: true,
            formatVersion: manifest.formatVersion,
            exportedAt: manifest.exportedAt,
            excalidashBackendVersion: manifest.excalidashBackendVersion || null,
            collections: manifest.collections.length,
            drawings: manifest.drawings.length,
            missingImages: manifest.missingImages?.length ?? 0,
          });
        }
        const knownFileIdsBeforeImport = new Map<number, Set<string>>();
        const finalDrawingIdMap = new Map<number, string>();
        for (let i = 0; i < preparedDrawings.length; i++) {
          const prepared = preparedDrawings[i];
          const existing = await prisma.drawing.findUnique({
            where: { id: prepared.id },
            select: { userId: true },
          });
          const finalId =
            existing && existing.userId !== req.user!.id
              ? uuidv4()
              : prepared.id;
          finalDrawingIdMap.set(i, finalId);
          const knownFiles = await prisma.drawingFile.findMany({
            where: { drawingId: finalId },
            select: { fileId: true },
          });
          knownFileIdsBeforeImport.set(
            i,
            new Set(knownFiles.map((file) => file.fileId)),
          );
        }
        const S3_UPLOAD_CONCURRENCY = 8;
        const processedFilesMap = new Map<number, Record<string, any>>();
        const processedHistoryFilesMap = new Map<
          number,
          Record<string, any>[]
        >();
        for (
          let start = 0;
          start < preparedDrawings.length;
          start += S3_UPLOAD_CONCURRENCY
        ) {
          const batch = preparedDrawings
            .slice(start, start + S3_UPLOAD_CONCURRENCY)
            .map(async (prepared, offset) => {
              const i = start + offset;
              const finalId = finalDrawingIdMap.get(i)!;
              const bundledFiles = new Map<
                string,
                { dataURL: string; mimeType: string }
              >();
              const internSceneFiles = async (
                files: Record<string, any>,
                sharedFileIds: string[] = [],
              ) => {
                const processed = await internDrawingFiles(
                  files,
                  req.user!.id,
                  finalId,
                  prisma,
                );
                for (const fileId of getInlineFileIds(files)) {
                  const { dataURL, mimeType } = processed[fileId];
                  bundledFiles.set(fileId, { dataURL, mimeType });
                }
                for (const fileId of sharedFileIds) {
                  processed[fileId] = {
                    ...processed[fileId],
                    ...bundledFiles.get(fileId)!,
                  };
                }
                return processed;
              };
              const processed = await internSceneFiles(
                prepared.sanitized?.files || {},
              );
              // Historical bytes may no longer appear in the live scene.
              const historyFiles = [];
              for (const snapshot of prepared.history) {
                historyFiles.push(
                  await internSceneFiles(
                    snapshot.sanitized.files || {},
                    snapshot.sharedFileIds,
                  ),
                );
              }
              return { i, processed, historyFiles };
            });
          const results = await Promise.all(batch);
          for (const { i, processed, historyFiles } of results) {
            processedFilesMap.set(i, processed);
            processedHistoryFilesMap.set(i, historyFiles);
          }
        }
        try {
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
              const existing = await tx.collection.findUnique({
                where: { id: c.id },
              });
              if (!existing) {
                await tx.collection.create({
                  data: {
                    id: c.id,
                    name: sanitizeText(c.name, 100) || "Collection",
                    userId: req.user!.id,
                  },
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
                data: {
                  id: newId,
                  name: sanitizeText(c.name, 100) || "Collection",
                  userId: req.user!.id,
                },
              });
              collectionIdMap.set(c.id, newId);
              collectionsCreated += 1;
              collectionIdConflicts += 1;
            }
            const resolveCollectionId = (
              collectionId: string | null,
            ): string | null => {
              if (!collectionId) return null;
              if (collectionId === "trash") return trashCollectionId;
              return collectionIdMap.get(collectionId) || null;
            };
            for (let i = 0; i < preparedDrawings.length; i++) {
              const prepared = preparedDrawings[i];
              const processedFiles = processedFilesMap.get(i) ?? {};
              const targetCollectionId = resolveCollectionId(
                prepared.collectionId,
              );
              const existing = await tx.drawing.findUnique({
                where: { id: prepared.id },
              });
              const finalId = finalDrawingIdMap.get(i) ?? prepared.id;
              const assertSceneFiles = async (
                source: Record<string, unknown>,
                processed: Record<string, unknown>,
              ) => {
                const knownBefore = knownFileIdsBeforeImport.get(i)!;
                const required = getRequiredImportedFileIds(
                  source,
                  processed,
                  finalId,
                  knownBefore,
                  prepared.missingFileIds,
                );
                await assertImportedFilesAvailable(tx, finalId, required);
              };
              await assertSceneFiles(prepared.sanitized!.files, processedFiles);
              for (let h = 0; h < prepared.history.length; h++) {
                await assertSceneFiles(
                  prepared.history[h].sanitized.files,
                  processedHistoryFilesMap.get(i)![h],
                );
              }
              const restoreHistory = async (drawingId: string) => {
                for (let h = 0; h < prepared.history.length; h++) {
                  const snapshot = prepared.history[h];
                  const existingSnapshot = await tx.drawingSnapshot.findUnique({
                    where: { id: snapshot.id },
                    select: { drawingId: true },
                  });
                  // Merges retain existing history; never overwrite a snapshot.
                  if (existingSnapshot?.drawingId === drawingId) continue;
                  await tx.drawingSnapshot.create({
                    data: {
                      id: existingSnapshot ? uuidv4() : snapshot.id,
                      drawingId,
                      version: snapshot.version,
                      createdAt: new Date(snapshot.createdAt),
                      elements: encodeSnapshotField(
                        JSON.stringify(snapshot.sanitized.elements),
                      ),
                      appState: encodeSnapshotField(
                        JSON.stringify(snapshot.sanitized.appState),
                      ),
                      files: encodeSnapshotField(
                        JSON.stringify(processedHistoryFilesMap.get(i)![h]),
                      ),
                    },
                  });
                }
              };
              const elementsJson = JSON.stringify(prepared.sanitized!.elements);
              const appStateJson = JSON.stringify(prepared.sanitized!.appState);
              const filesJson = JSON.stringify(processedFiles);
              const previewValue = prepared.sanitized!.preview ?? null;
              if (!existing) {
                await tx.drawing.create({
                  data: {
                    id: finalId,
                    name: prepared.name,
                    elements: elementsJson,
                    appState: appStateJson,
                    files: filesJson,
                    preview: previewValue,
                    version: prepared.version ?? 1,
                    userId: req.user!.id,
                    collectionId: targetCollectionId,
                  },
                });
                await restoreHistory(finalId);
                drawingsCreated += 1;
                continue;
              }
              if (existing.userId === req.user!.id) {
                await replaceImportedDrawing(tx, existing, {
                  name: prepared.name,
                  elements: elementsJson,
                  appState: appStateJson,
                  files: filesJson,
                  preview: previewValue,
                  collectionId: targetCollectionId,
                });
                await restoreHistory(finalId);
                drawingsUpdated += 1;
                continue;
              }
              const createId = finalId === prepared.id ? uuidv4() : finalId;
              if (createId !== finalId) {
                console.warn(
                  `[import/excalidash] race conflict on drawing ${prepared.id}; ` +
                    `creating under ${createId}; S3 objects keyed under ` +
                    `${prepared.id} are now orphans`,
                );
              }
              await tx.drawing.create({
                data: {
                  id: createId,
                  name: prepared.name,
                  elements: elementsJson,
                  appState: appStateJson,
                  files: filesJson,
                  preview: previewValue,
                  version: prepared.version ?? 1,
                  userId: req.user!.id,
                  collectionId: targetCollectionId,
                },
              });
              await restoreHistory(createId);
              drawingsCreated += 1;
              drawingIdConflicts += 1;
            }
            return {
              collections: {
                created: collectionsCreated,
                updated: collectionsUpdated,
                idConflicts: collectionIdConflicts,
              },
              drawings: {
                created: drawingsCreated,
                updated: drawingsUpdated,
                idConflicts: drawingIdConflicts,
              },
            };
          });
          invalidateDrawingsCache();
          return res.json({
            success: true,
            message: "Backup imported successfully",
            ...result,
          });
        } catch (error) {
          if (error instanceof ImportValidationError) {
            return res
              .status(error.status)
              .json({ error: "Import failed", message: error.message });
          }
          throw error;
        }
      } finally {
        await removeFileIfExists(stagedPath);
      }
    });
  app.post(
    "/import/excalidash/verify",
    requireAuth,
    upload.single("archive"),
    importArchive(true),
  );
  app.post(
    "/import/excalidash",
    requireAuth,
    upload.single("archive"),
    importArchive(false),
  );
};
