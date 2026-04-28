import { v4 as uuidv4 } from "uuid";
import {
  RegisterImportExportDeps,
  ImportValidationError,
  findFirstDuplicate,
  findSqliteTable,
  getCurrentLatestPrismaMigrationName,
  getUserTrashCollectionId,
  normalizeNonEmptyId,
  openReadonlySqliteDb,
  parseOptionalJson,
  resolveSafeUploadedFilePath,
  sanitizeDrawingData,
} from "./shared";
import { processFilesForS3 } from "../../fileProcessing";

export const registerLegacySqliteImportRoutes = (deps: RegisterImportExportDeps) => {
  const {
    app,
    prisma,
    requireAuth,
    asyncHandler,
    upload,
    uploadDir,
    backendRoot,
    sanitizeText,
    validateImportedDrawing,
    ensureTrashCollection,
    invalidateDrawingsCache,
    removeFileIfExists,
    verifyDatabaseIntegrityAsync,
    MAX_IMPORT_COLLECTIONS,
    MAX_IMPORT_DRAWINGS,
  } = deps;

  app.post("/import/sqlite/legacy/verify", requireAuth, upload.single("db"), asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    let stagedPath: string;
    try {
      stagedPath = await resolveSafeUploadedFilePath(
        { filename: req.file.filename },
        uploadDir
      );
    } catch (error) {
      if (error instanceof ImportValidationError) {
        return res.status(error.status).json({ error: "Invalid upload", message: error.message });
      }
      throw error;
    }
    try {
      const isValid = await verifyDatabaseIntegrityAsync(stagedPath);
      if (!isValid) return res.status(400).json({ error: "Invalid database format" });

      let db: any | null = null;
      try {
        db = openReadonlySqliteDb(stagedPath);
        const tables: string[] = db
          .prepare("SELECT name FROM sqlite_master WHERE type='table'")
          .all()
          .map((row: any) => String(row.name));

        const drawingTable = findSqliteTable(tables, ["Drawing", "drawings"]);
        const collectionTable = findSqliteTable(tables, ["Collection", "collections"]);
        if (!drawingTable) {
          return res.status(400).json({ error: "Invalid legacy DB", message: "Missing Drawing table" });
        }

        const drawingsCount = Number(db.prepare(`SELECT COUNT(1) as c FROM "${drawingTable}"`).get()?.c ?? 0);
        const collectionsCount = collectionTable
          ? Number(db.prepare(`SELECT COUNT(1) as c FROM "${collectionTable}"`).get()?.c ?? 0)
          : 0;
        if (drawingsCount > MAX_IMPORT_DRAWINGS) {
          return res.status(400).json({
            error: "Invalid legacy DB",
            message: `Too many drawings (max ${MAX_IMPORT_DRAWINGS})`,
          });
        }
        if (collectionsCount > MAX_IMPORT_COLLECTIONS) {
          return res.status(400).json({
            error: "Invalid legacy DB",
            message: `Too many collections (max ${MAX_IMPORT_COLLECTIONS})`,
          });
        }

        const duplicateDrawingIdRow = db
          .prepare(
            `SELECT id FROM "${drawingTable}" WHERE id IS NOT NULL GROUP BY id HAVING COUNT(1) > 1 LIMIT 1`
          )
          .get();
        if (duplicateDrawingIdRow?.id) {
          return res.status(400).json({
            error: "Invalid legacy DB",
            message: `Duplicate drawing id in legacy DB: ${String(duplicateDrawingIdRow.id)}`,
          });
        }
        if (collectionTable) {
          const duplicateCollectionIdRow = db
            .prepare(
              `SELECT id FROM "${collectionTable}" WHERE id IS NOT NULL GROUP BY id HAVING COUNT(1) > 1 LIMIT 1`
            )
            .get();
          if (duplicateCollectionIdRow?.id) {
            return res.status(400).json({
              error: "Invalid legacy DB",
              message: `Duplicate collection id in legacy DB: ${String(duplicateCollectionIdRow.id)}`,
            });
          }
        }

        let latestMigration: string | null = null;
        const migrationsTable = findSqliteTable(tables, ["_prisma_migrations"]);
        if (migrationsTable) {
          try {
            const row = db
              .prepare(
                `SELECT migration_name as name, finished_at as finishedAt FROM "${migrationsTable}" ORDER BY finished_at DESC LIMIT 1`
              )
              .get();
            if (row?.name) latestMigration = String(row.name);
          } catch {
            latestMigration = null;
          }
        }

        return res.json({
          valid: true,
          drawings: drawingsCount,
          collections: collectionsCount,
          latestMigration,
          currentLatestMigration: await getCurrentLatestPrismaMigrationName(backendRoot),
        });
      } catch {
        return res.status(500).json({
          error: "Legacy DB support unavailable",
          message:
            "Failed to open the SQLite database for inspection. If you're on Node < 22, you may need to rebuild native dependencies (e.g. `cd backend && npm rebuild better-sqlite3`).",
        });
      } finally {
        try {
          db?.close?.();
        } catch {}
      }
    } finally {
      await removeFileIfExists(stagedPath);
    }
  }));

  app.post("/import/sqlite/legacy", requireAuth, upload.single("db"), asyncHandler(async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    let stagedPath: string;
    try {
      stagedPath = await resolveSafeUploadedFilePath(
        { filename: req.file.filename },
        uploadDir
      );
    } catch (error) {
      if (error instanceof ImportValidationError) {
        return res.status(error.status).json({ error: "Invalid upload", message: error.message });
      }
      throw error;
    }
    try {
      const isValid = await verifyDatabaseIntegrityAsync(stagedPath);
      if (!isValid) return res.status(400).json({ error: "Invalid database format" });

      let legacyDb: any | null = null;
      try {
        legacyDb = openReadonlySqliteDb(stagedPath);
        const tables: string[] = legacyDb
          .prepare("SELECT name FROM sqlite_master WHERE type='table'")
          .all()
          .map((row: any) => String(row.name));

        const drawingTable = findSqliteTable(tables, ["Drawing", "drawings"]);
        const collectionTable = findSqliteTable(tables, ["Collection", "collections"]);
        if (!drawingTable) {
          return res.status(400).json({ error: "Invalid legacy DB", message: "Missing Drawing table" });
        }

        const importedCollections: any[] = collectionTable
          ? legacyDb.prepare(`SELECT * FROM "${collectionTable}"`).all()
          : [];
        const importedDrawings: any[] = legacyDb.prepare(`SELECT * FROM "${drawingTable}"`).all();

        if (importedCollections.length > MAX_IMPORT_COLLECTIONS) {
          return res.status(400).json({
            error: "Invalid legacy DB",
            message: `Too many collections (max ${MAX_IMPORT_COLLECTIONS})`,
          });
        }
        if (importedDrawings.length > MAX_IMPORT_DRAWINGS) {
          return res.status(400).json({
            error: "Invalid legacy DB",
            message: `Too many drawings (max ${MAX_IMPORT_DRAWINGS})`,
          });
        }

        const importedCollectionIds = importedCollections
          .map((c) => normalizeNonEmptyId(c?.id))
          .filter((id): id is string => id !== null);
        const duplicateCollectionId = findFirstDuplicate(importedCollectionIds);
        if (duplicateCollectionId) {
          return res.status(400).json({
            error: "Invalid legacy DB",
            message: `Duplicate collection id in legacy DB: ${duplicateCollectionId}`,
          });
        }

        const importedDrawingIds = importedDrawings
          .map((d) => normalizeNonEmptyId(d?.id))
          .filter((id): id is string => id !== null);
        const duplicateDrawingId = findFirstDuplicate(importedDrawingIds);
        if (duplicateDrawingId) {
          return res.status(400).json({
            error: "Invalid legacy DB",
            message: `Duplicate drawing id in legacy DB: ${duplicateDrawingId}`,
          });
        }

        type PreparedLegacyDrawing = {
          importedId: string | null;
          name: string;
          sanitized: ReturnType<typeof sanitizeDrawingData>;
          collectionIdRaw: unknown;
          collectionNameRaw: unknown;
          versionRaw: unknown;
        };

        const preparedDrawings: PreparedLegacyDrawing[] = [];
        for (const d of importedDrawings) {
          const importPayload = {
            name: typeof d.name === "string" ? d.name : "Untitled Drawing",
            elements: parseOptionalJson<unknown[]>(d.elements, []),
            appState: parseOptionalJson<Record<string, unknown>>(d.appState, {}),
            files: parseOptionalJson<Record<string, unknown>>(d.files, {}),
            preview: typeof d.preview === "string" ? d.preview : null,
            collectionId: null as string | null,
          };

          if (!validateImportedDrawing(importPayload)) {
            return res.status(400).json({
              error: "Invalid imported drawing",
              message: "Legacy database contains invalid drawing data",
            });
          }

          preparedDrawings.push({
            importedId: typeof d.id === "string" ? d.id : null,
            name: sanitizeText(importPayload.name, 255) || "Untitled Drawing",
            sanitized: sanitizeDrawingData(importPayload),
            collectionIdRaw: d.collectionId,
            collectionNameRaw: d.collectionName,
            versionRaw: d.version,
          });
        }

        // Process files for S3 upload before entering the transaction
        const processedFilesMap = new Map<number, Record<string, any>>();
        for (let i = 0; i < preparedDrawings.length; i++) {
          const d = preparedDrawings[i];
          const files = d.sanitized.files || {};
          const drawingIdForS3 = d.importedId || uuidv4();
          // Store generated ID so the transaction can reuse it
          if (!d.importedId) d.importedId = drawingIdForS3;
          processedFilesMap.set(
            i,
            await processFilesForS3(files, req.user!.id, drawingIdForS3, prisma),
          );
        }

        const result = await prisma.$transaction(async (tx) => {
          const trashCollectionId = getUserTrashCollectionId(req.user!.id);
          const hasTrash = importedDrawings.some((d) => String(d.collectionId || "") === "trash");
          if (hasTrash) await ensureTrashCollection(tx, req.user!.id);

          const collectionIdMap = new Map<string, string>();
          let collectionsCreated = 0;
          let collectionsUpdated = 0;
          let collectionIdConflicts = 0;
          let drawingsCreated = 0;
          let drawingsUpdated = 0;
          let drawingIdConflicts = 0;

          for (const c of importedCollections) {
            const importedId = typeof c.id === "string" ? c.id : null;
            const name = typeof c.name === "string" ? c.name : "Collection";

            if (importedId === "trash" || name === "Trash") {
              collectionIdMap.set(importedId || "trash", trashCollectionId);
              continue;
            }

            if (!importedId) {
              const newId = uuidv4();
              await tx.collection.create({
                data: { id: newId, name: sanitizeText(name, 100) || "Collection", userId: req.user!.id },
              });
              collectionIdMap.set(`__name:${name}`, newId);
              collectionsCreated += 1;
              continue;
            }

            const existing = await tx.collection.findUnique({ where: { id: importedId } });
            if (!existing) {
              await tx.collection.create({
                data: { id: importedId, name: sanitizeText(name, 100) || "Collection", userId: req.user!.id },
              });
              collectionIdMap.set(importedId, importedId);
              collectionsCreated += 1;
              continue;
            }
            if (existing.userId === req.user!.id) {
              await tx.collection.update({
                where: { id: importedId },
                data: { name: sanitizeText(name, 100) || "Collection" },
              });
              collectionIdMap.set(importedId, importedId);
              collectionsUpdated += 1;
              continue;
            }

            const newId = uuidv4();
            await tx.collection.create({
              data: { id: newId, name: sanitizeText(name, 100) || "Collection", userId: req.user!.id },
            });
            collectionIdMap.set(importedId, newId);
            collectionsCreated += 1;
            collectionIdConflicts += 1;
          }

          const resolveImportedCollectionId = (
            rawCollectionId: unknown,
            rawCollectionName: unknown
          ): string | null => {
            const id = typeof rawCollectionId === "string" ? rawCollectionId : null;
            const name = typeof rawCollectionName === "string" ? rawCollectionName : null;

            if (id === "trash" || name === "Trash") return trashCollectionId;
            if (id && collectionIdMap.has(id)) return collectionIdMap.get(id)!;
            if (name && collectionIdMap.has(`__name:${name}`)) return collectionIdMap.get(`__name:${name}`)!;
            return null;
          };

          for (let i = 0; i < preparedDrawings.length; i++) {
            const d = preparedDrawings[i];
            const processedFiles = processedFilesMap.get(i) ?? {};
            const resolvedCollectionId = resolveImportedCollectionId(d.collectionIdRaw, d.collectionNameRaw);
            const existing = d.importedId ? await tx.drawing.findUnique({ where: { id: d.importedId } }) : null;

            if (!existing) {
              const idToUse = d.importedId || uuidv4();
              await tx.drawing.create({
                data: {
                  id: idToUse,
                  name: d.name,
                  elements: JSON.stringify(d.sanitized.elements),
                  appState: JSON.stringify(d.sanitized.appState),
                  files: JSON.stringify(processedFiles),
                  preview: d.sanitized.preview ?? null,
                  version: Number.isFinite(Number(d.versionRaw)) ? Number(d.versionRaw) : 1,
                  userId: req.user!.id,
                  collectionId: resolvedCollectionId ?? null,
                },
              });
              drawingsCreated += 1;
              continue;
            }

            if (existing.userId === req.user!.id) {
              await tx.drawing.update({
                where: { id: existing.id },
                data: {
                  name: d.name,
                  elements: JSON.stringify(d.sanitized.elements),
                  appState: JSON.stringify(d.sanitized.appState),
                  files: JSON.stringify(processedFiles),
                  preview: d.sanitized.preview ?? null,
                  version: Number.isFinite(Number(d.versionRaw)) ? Number(d.versionRaw) : existing.version,
                  collectionId: resolvedCollectionId ?? null,
                },
              });
              drawingsUpdated += 1;
              continue;
            }

            const newId = uuidv4();
            await tx.drawing.create({
              data: {
                id: newId,
                name: d.name,
                elements: JSON.stringify(d.sanitized.elements),
                appState: JSON.stringify(d.sanitized.appState),
                files: JSON.stringify(processedFiles),
                preview: d.sanitized.preview ?? null,
                version: Number.isFinite(Number(d.versionRaw)) ? Number(d.versionRaw) : 1,
                userId: req.user!.id,
                collectionId: resolvedCollectionId ?? null,
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
        return res.json({ success: true, ...result });
      } catch {
        return res.status(500).json({
          error: "Legacy DB support unavailable",
          message:
            "Failed to open the SQLite database for import. If you're on Node < 22, you may need to rebuild native dependencies (e.g. `cd backend && npm rebuild better-sqlite3`).",
        });
      } finally {
        try {
          legacyDb?.close?.();
        } catch {}
      }
    } finally {
      await removeFileIfExists(stagedPath);
    }
  }));
};
