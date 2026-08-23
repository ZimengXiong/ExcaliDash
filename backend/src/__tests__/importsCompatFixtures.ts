import fs from "fs";
import path from "path";
import os from "os";
import JSZip from "jszip";

type LegacyDbOptions = {
  tableStyle: "prisma" | "plural-lower";
  includeCollections: boolean;
  includeMigrationsTable: boolean;
  includeTrashDrawing: boolean;
};

export const createTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "excalidash-legacy-"));

export const openWritableDb = (filePath: string): any => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require("node:sqlite") as any;
    return new DatabaseSync(filePath, { enableForeignKeyConstraints: false });
  } catch (_err) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require("better-sqlite3") as any;
    return new Database(filePath);
  }
};

export const createLegacySqliteDb = (opts: LegacyDbOptions): string => {
  const dir = createTempDir();
  const filePath = path.join(dir, "legacy-export.db");
  const db = openWritableDb(filePath);

  const tableDrawing = opts.tableStyle === "plural-lower" ? "drawings" : "Drawing";
  const tableCollection = opts.tableStyle === "plural-lower" ? "collections" : "Collection";

  try {
    if (opts.includeCollections) {
      db.exec(`
        CREATE TABLE "${tableCollection}" (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          createdAt TEXT,
          updatedAt TEXT
        );
      `);
      db.prepare(`INSERT INTO "${tableCollection}" (id, name, createdAt, updatedAt) VALUES (?, ?, ?, ?)`).run(
        "legacy-collection-1",
        "Legacy Collection",
        new Date("2024-01-01T00:00:00.000Z").toISOString(),
        new Date("2024-01-02T00:00:00.000Z").toISOString(),
      );
    }

    db.exec(`
      CREATE TABLE "${tableDrawing}" (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        elements TEXT NOT NULL,
        appState TEXT NOT NULL,
        files TEXT,
        preview TEXT,
        version INTEGER,
        collectionId TEXT,
        collectionName TEXT,
        createdAt TEXT,
        updatedAt TEXT
      );
    `);

    const now = new Date("2024-01-03T00:00:00.000Z").toISOString();
    const insertDrawing = db.prepare(
      `INSERT INTO "${tableDrawing}"
        (id, name, elements, appState, files, preview, version, collectionId, collectionName, createdAt, updatedAt)
        VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    insertDrawing.run(
      "legacy-drawing-1",
      "Legacy Drawing 1",
      JSON.stringify([]),
      JSON.stringify({}),
      JSON.stringify({}),
      null,
      1,
      opts.includeCollections ? "legacy-collection-1" : null,
      opts.includeCollections ? "Legacy Collection" : null,
      now,
      now,
    );

    insertDrawing.run(
      "legacy-drawing-2",
      "Legacy Drawing 2 (unorganized)",
      JSON.stringify([]),
      JSON.stringify({}),
      JSON.stringify({}),
      null,
      2,
      null,
      null,
      now,
      now,
    );

    if (opts.includeTrashDrawing) {
      insertDrawing.run(
        "legacy-drawing-trash",
        "Legacy Trash Drawing",
        JSON.stringify([]),
        JSON.stringify({}),
        JSON.stringify({}),
        null,
        1,
        "trash",
        "Trash",
        now,
        now,
      );
    }

    if (opts.includeMigrationsTable) {
      db.exec(`
        CREATE TABLE "_prisma_migrations" (
          id TEXT PRIMARY KEY NOT NULL,
          checksum TEXT NOT NULL,
          finished_at TEXT,
          migration_name TEXT NOT NULL,
          logs TEXT,
          rolled_back_at TEXT,
          started_at TEXT NOT NULL,
          applied_steps_count INTEGER NOT NULL DEFAULT 0
        );
      `);
      db.prepare(
        `INSERT INTO "_prisma_migrations"
          (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
          VALUES
          (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        "m1",
        "checksum",
        new Date("2024-01-04T00:00:00.000Z").toISOString(),
        "20240104000000_initial",
        null,
        null,
        new Date("2024-01-04T00:00:00.000Z").toISOString(),
        1,
      );
    }
  } finally {
    db.close();
  }

  return filePath;
};

export const createExcalidashArchiveWithDuplicateDrawingIds = async (): Promise<string> => {
  const dir = createTempDir();
  const filePath = path.join(dir, "duplicate-drawing-ids.excalidash");
  const zip = new JSZip();

  const manifest = {
    format: "excalidash",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    unorganizedFolder: "Unorganized",
    collections: [] as any[],
    drawings: [
      {
        id: "duplicate-drawing-id",
        name: "Drawing One",
        filePath: "Unorganized/drawing-1.excalidraw",
        collectionId: null,
      },
      {
        id: "duplicate-drawing-id",
        name: "Drawing Two",
        filePath: "Unorganized/drawing-2.excalidraw",
        collectionId: null,
      },
    ],
  };

  zip.file("excalidash.manifest.json", JSON.stringify(manifest));
  zip.file(
    "Unorganized/drawing-1.excalidraw",
    JSON.stringify({ type: "excalidraw", version: 2, source: "test", elements: [], appState: {}, files: {} })
  );
  zip.file(
    "Unorganized/drawing-2.excalidraw",
    JSON.stringify({ type: "excalidraw", version: 2, source: "test", elements: [], appState: {}, files: {} })
  );

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  fs.writeFileSync(filePath, buffer);
  return filePath;
};

export const createExcalidashArchiveWithLargeDrawing = async (): Promise<Buffer> => {
  const zip = new JSZip();
  const drawingId = "large-backup-drawing";
  const drawingPath = "Unorganized/large-backup-drawing.excalidraw";
  const manifest = {
    format: "excalidash",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    unorganizedFolder: "Unorganized",
    collections: [] as any[],
    drawings: [
      {
        id: drawingId,
        name: "Large backup drawing",
        filePath: drawingPath,
        collectionId: null,
      },
    ],
  };
  const dataURL = `data:image/png;base64,${"A".repeat(5 * 1024 * 1024)}`;

  zip.file("excalidash.manifest.json", JSON.stringify(manifest));
  zip.file(
    drawingPath,
    JSON.stringify({
      type: "excalidraw",
      version: 2,
      source: "test",
      elements: [],
      appState: {},
      files: {
        "large-image": {
          id: "large-image",
          mimeType: "image/png",
          dataURL,
          created: 1,
        },
      },
    })
  );

  return zip.generateAsync({ type: "nodebuffer" });
};

export const createLegacySqliteDbWithDuplicateDrawingIds = (): string => {
  const dir = createTempDir();
  const filePath = path.join(dir, "legacy-duplicate-ids.db");
  const db = openWritableDb(filePath);

  try {
    db.exec(`
      CREATE TABLE "Drawing" (
        id TEXT,
        name TEXT NOT NULL,
        elements TEXT NOT NULL,
        appState TEXT NOT NULL,
        files TEXT,
        preview TEXT,
        version INTEGER,
        collectionId TEXT,
        collectionName TEXT,
        createdAt TEXT,
        updatedAt TEXT
      );
    `);

    const now = new Date("2024-01-03T00:00:00.000Z").toISOString();
    const insertDrawing = db.prepare(
      `INSERT INTO "Drawing"
        (id, name, elements, appState, files, preview, version, collectionId, collectionName, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    insertDrawing.run(
      "legacy-duplicate-id",
      "Legacy Drawing A",
      JSON.stringify([]),
      JSON.stringify({}),
      JSON.stringify({}),
      null,
      1,
      null,
      null,
      now,
      now,
    );

    insertDrawing.run(
      "legacy-duplicate-id",
      "Legacy Drawing B",
      JSON.stringify([]),
      JSON.stringify({}),
      JSON.stringify({}),
      null,
      1,
      null,
      null,
      now,
      now,
    );
  } finally {
    db.close();
  }

  return filePath;
};
