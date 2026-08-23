import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import {
  createExcalidashArchiveWithDuplicateDrawingIds,
  createExcalidashArchiveWithLargeDrawing,
  createLegacySqliteDb,
  createLegacySqliteDbWithDuplicateDrawingIds,
  createTempDir,
  openWritableDb,
} from "./importsCompatFixtures";
import { getTestPrisma, setupTestDb, cleanupTestDb } from "./testUtils";
import { BOOTSTRAP_USER_ID } from "../auth/authMode";

describe("Import compatibility (legacy exports)", () => {
  const uploadsDir = path.resolve(__dirname, "../../uploads");
  const userAgent = "vitest-import-compat";
  let prisma: ReturnType<typeof getTestPrisma>;
  let app: any;
  let agent: any;
  let csrfHeaderName: string;
  let csrfToken: string;

  beforeAll(async () => {
    setupTestDb();
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
    expect(res.body.currentLatestMigration).toMatch(/^\d{14}_.+/);
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

  it("imports a backup whose drawing JSON exceeds the former 5 MiB limit", async () => {
    const archive = await createExcalidashArchiveWithLargeDrawing();
    const res = await agent
      .post("/import/excalidash")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .attach("archive", archive, "large-backup.excalidash");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const drawing = await prisma.drawing.findUnique({
      where: { id: "large-backup-drawing" },
    });
    expect(drawing).toBeTruthy();
    expect(JSON.parse(drawing!.files)).toHaveProperty("large-image");
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

  const downloadExport = async (): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      agent
        .get("/export/excalidash")
        .set("User-Agent", userAgent)
        .buffer(true)
        .parse((res: any, callback: (err: Error | null, body: Buffer) => void) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
          res.on("end", () => callback(null, Buffer.concat(chunks)));
          res.on("error", (err: Error) => callback(err, Buffer.alloc(0)));
        })
        .end((err: Error | null, res: any) => (err ? reject(err) : resolve(res.body as Buffer)));
    });

  it("leaves excalidraw drawings byte-identical through export + re-import", async () => {
    const elements = [{ id: "el1", type: "rectangle", x: 0, y: 0, width: 5, height: 5 }];
    await prisma.drawing.create({
      data: {
        id: "excalidraw-roundtrip-1",
        name: "Sketch",
        elements: JSON.stringify(elements),
        appState: JSON.stringify({}),
        files: "{}",
        version: 1,
        userId: BOOTSTRAP_USER_ID,
      },
    });

    const buffer = await downloadExport();
    const zip = await JSZip.loadAsync(buffer);
    const manifest = JSON.parse(await zip.file("excalidash.manifest.json")!.async("string"));
    const entry = manifest.drawings.find((d: any) => d.id === "excalidraw-roundtrip-1");
    expect(entry.filePath).toMatch(/\.excalidraw$/);

    const res = await agent
      .post("/import/excalidash")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .attach("archive", buffer, "backup.excalidash");

    expect(res.status).toBe(200);

    const row = await prisma.drawing.findUnique({ where: { id: "excalidraw-roundtrip-1" } });
    expect(JSON.parse(row!.elements)).toEqual(elements);
  });

  it("exports managed image references as portable inline data URLs", async () => {
    const imageBytes = Buffer.from("portable backup image");
    await prisma.drawing.create({
      data: {
        id: "portable-image-export",
        name: "Portable image",
        elements: "[]",
        appState: "{}",
        files: JSON.stringify({
          image: {
            id: "image",
            mimeType: "image/png",
            dataURL: "/api/files/portable-image-export/image",
            created: 123,
          },
        }),
        version: 1,
        userId: BOOTSTRAP_USER_ID,
      },
    });
    await prisma.drawingFile.create({
      data: {
        drawingId: "portable-image-export",
        fileId: "image",
        mimeType: "image/png",
        sizeBytes: imageBytes.length,
        storage: "db",
        data: imageBytes,
      },
    });

    const zip = await JSZip.loadAsync(await downloadExport());
    const manifest = JSON.parse(
      await zip.file("excalidash.manifest.json")!.async("string"),
    );
    const entry = manifest.drawings.find(
      (drawing: any) => drawing.id === "portable-image-export",
    );
    const exportedDrawing = JSON.parse(
      await zip.file(entry.filePath)!.async("string"),
    );

    expect(exportedDrawing.files.image).toMatchObject({
      id: "image",
      mimeType: "image/png",
      dataURL: `data:image/png;base64,${imageBytes.toString("base64")}`,
      created: 123,
    });
  });
});
