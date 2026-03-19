import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";
import os from "os";
import JSZip from "jszip";
import { getTestPrisma, setupTestDb, cleanupTestDb } from "./testUtils";
import { BOOTSTRAP_USER_ID } from "../auth/authMode";

type LegacyDbOptions = {
  tableStyle: "prisma" | "plural-lower";
  includeCollections: boolean;
  includeMigrationsTable: boolean;
  includeTrashDrawing: boolean;
};

const createTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "excalidash-legacy-"));

const openWritableDb = (filePath: string): any => {
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

const createLegacySqliteDb = (opts: LegacyDbOptions): string => {
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

const createExcalidashArchiveWithDuplicateDrawingIds = async (): Promise<string> => {
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

const createLegacySqliteDbWithDuplicateDrawingIds = (): string => {
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

describe("Import compatibility (legacy exports)", () => {
  const uploadsDir = path.resolve(__dirname, "../../uploads");
  const userAgent = "vitest-import-compat";
  let prisma: ReturnType<typeof getTestPrisma>;
  let app: any;
  let agent: any;
  let csrfHeaderName: string;
  let csrfToken: string;

  beforeAll(async () => {
    await setupTestDb();
    prisma = getTestPrisma();
    fs.mkdirSync(uploadsDir, { recursive: true });

    ({ app } = await import("../index"));

    agent = request.agent(app);
    const csrfRes = await agent.get("/csrf-token").set("User-Agent", userAgent);
    csrfHeaderName = csrfRes.body.header;
    csrfToken = csrfRes.body.token;
    expect(typeof csrfHeaderName).toBe("string");
    expect(typeof csrfToken).toBe("string");
  });

  beforeEach(async () => {
    await cleanupTestDb(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("verifies a v0.1.x–v0.3.2-style SQLite export (Drawing/Collection tables) and returns migration info when present", async () => {
    const legacyDb = createLegacySqliteDb({
      tableStyle: "prisma",
      includeCollections: true,
      includeMigrationsTable: true,
      includeTrashDrawing: false,
    });

    const res = await agent
      .post("/import/sqlite/legacy/verify")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .attach("db", legacyDb);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.drawings).toBe(2);
    expect(res.body.collections).toBe(1);
    expect(res.body.latestMigration).toBe("20240104000000_initial");
    expect(typeof res.body.currentLatestMigration === "string").toBe(true);
  });

  it("merge-imports a legacy SQLite export into the current account without replacing the database", async () => {
    const legacyDb = createLegacySqliteDb({
      tableStyle: "prisma",
      includeCollections: true,
      includeMigrationsTable: false,
      includeTrashDrawing: true,
    });

    const res = await agent
      .post("/import/sqlite/legacy")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .attach("db", legacyDb);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.collections?.created).toBeGreaterThanOrEqual(1);
    expect(res.body.drawings?.created).toBeGreaterThanOrEqual(3);

    const importedDrawings = await prisma.drawing.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, collectionId: true, userId: true },
    });

    expect(importedDrawings.every((d) => d.userId === BOOTSTRAP_USER_ID)).toBe(true);
    expect(importedDrawings.map((d) => d.id)).toEqual(
      expect.arrayContaining(["legacy-drawing-1", "legacy-drawing-2", "legacy-drawing-trash"])
    );

    const trash = await prisma.collection.findUnique({
      where: { id: `trash:${BOOTSTRAP_USER_ID}` },
    });
    expect(trash).toBeTruthy();
  });

  it("supports older exports with plural/lowercase table names (drawings/collections)", async () => {
    const legacyDb = createLegacySqliteDb({
      tableStyle: "plural-lower",
      includeCollections: true,
      includeMigrationsTable: false,
      includeTrashDrawing: false,
    });

    const verify = await agent
      .post("/import/sqlite/legacy/verify")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .attach("db", legacyDb);

    expect(verify.status).toBe(200);
    expect(verify.body.drawings).toBe(2);
    expect(verify.body.collections).toBe(1);

    const res = await agent
      .post("/import/sqlite/legacy")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .attach("db", legacyDb);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("fails verification if the legacy DB is missing a Drawing table", async () => {
    const dir = createTempDir();
    const filePath = path.join(dir, "invalid.db");
    const db = openWritableDb(filePath);
    db.exec(`CREATE TABLE "NotDrawing" (id TEXT PRIMARY KEY NOT NULL);`);
    db.close();

    const res = await agent
      .post("/import/sqlite/legacy/verify")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .attach("db", filePath);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid legacy DB");
  });

  it("rejects .excalidash verify when manifest has duplicate drawing IDs", async () => {
    const archive = await createExcalidashArchiveWithDuplicateDrawingIds();
    const res = await agent
      .post("/import/excalidash/verify")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .attach("archive", archive);

    expect(res.status).toBe(400);
    expect(String(res.body.message || "")).toContain("Duplicate drawing id");
  });

  it("rejects .excalidash import when manifest has duplicate drawing IDs", async () => {
    const archive = await createExcalidashArchiveWithDuplicateDrawingIds();
    const res = await agent
      .post("/import/excalidash")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .attach("archive", archive);

    expect(res.status).toBe(400);
    expect(String(res.body.message || "")).toContain("Duplicate drawing id");
  });

  it("rejects legacy verify when DB has duplicate drawing IDs", async () => {
    const legacyDb = createLegacySqliteDbWithDuplicateDrawingIds();
    const res = await agent
      .post("/import/sqlite/legacy/verify")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .attach("db", legacyDb);

    expect(res.status).toBe(400);
    expect(String(res.body.message || "")).toContain("Duplicate drawing id");
  });

  it("rejects legacy import when DB has duplicate drawing IDs", async () => {
    const legacyDb = createLegacySqliteDbWithDuplicateDrawingIds();
    const res = await agent
      .post("/import/sqlite/legacy")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .attach("db", legacyDb);

    expect(res.status).toBe(400);
    expect(String(res.body.message || "")).toContain("Duplicate drawing id");
  });
});
