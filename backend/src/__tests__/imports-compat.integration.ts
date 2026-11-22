import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { randomBytes } from "crypto";
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
import { downloadBuffer } from "../s3";
import {
  encodeSnapshotField,
  decodeSnapshotField,
} from "../snapshots/snapshotCodec";
import { replaceImportedDrawing } from "../routes/importExport/shared";
import { internDrawingFiles } from "../fileProcessing";

vi.mock("../s3", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../s3")>()),
  downloadBuffer: vi.fn(),
}));

vi.mock("../fileProcessing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../fileProcessing")>();
  return { ...actual, internDrawingFiles: vi.fn(actual.internDrawingFiles) };
});

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
    await prisma.drawingFile.deleteMany({});
    vi.mocked(downloadBuffer).mockReset();
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

    expect(importedDrawings.every((d) => d.userId === BOOTSTRAP_USER_ID)).toBe(
      true,
    );
    expect(importedDrawings.map((d) => d.id)).toEqual(
      expect.arrayContaining([
        "legacy-drawing-1",
        "legacy-drawing-2",
        "legacy-drawing-trash",
      ]),
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

  const seedDrawingBeforeInvalidImport = async (id: string) => {
    await agent.get("/collections").set("User-Agent", userAgent);
    const drawing = await prisma.drawing.create({
      data: {
        id,
        name: "Keep this drawing",
        elements: JSON.stringify([
          {
            id: "saved-element",
            type: "rectangle",
            x: 1,
            y: 2,
            width: 3,
            height: 4,
          },
        ]),
        appState: JSON.stringify({ viewBackgroundColor: "#fedcba" }),
        files: JSON.stringify({
          "saved-image": {
            id: "saved-image",
            mimeType: "image/png",
            created: 123,
            dataURL: `/api/files/${id}/saved-image`,
          },
        }),
        version: 7,
        userId: BOOTSTRAP_USER_ID,
      },
    });
    await prisma.drawingFile.create({
      data: {
        drawingId: id,
        fileId: "saved-image",
        mimeType: "image/png",
        storage: "db",
        data: Buffer.from("keep saved bytes"),
        sizeBytes: 16,
      },
    });
    await prisma.drawingSnapshot.create({
      data: {
        drawingId: id,
        version: 6,
        elements: "[]",
        appState: "{}",
        files: "{}",
      },
    });
    return drawing;
  };

  it.each([
    ["missing elements", { appState: {}, files: {} }],
    ["object elements", { elements: {}, appState: {}, files: {} }],
    ["null elements", { elements: null, appState: {}, files: {} }],
    ["string appState", { elements: [], appState: "corrupt", files: {} }],
    ["array files", { elements: [], appState: {}, files: [] }],
  ])(
    "rejects backup %s without overwriting any drawings",
    async (_label, scene) => {
      const drawing = await seedDrawingBeforeInvalidImport(
        "invalid-backup-existing",
      );
      const history = await prisma.drawingSnapshot.findMany({
        where: { drawingId: drawing.id },
      });
      const zip = new JSZip();
      zip.file(
        "excalidash.manifest.json",
        JSON.stringify({
          format: "excalidash",
          formatVersion: 1,
          exportedAt: new Date().toISOString(),
          unorganizedFolder: "Unorganized",
          collections: [
            {
              id: "must-not-create",
              name: "Rejected collection",
              folder: "Rejected",
            },
          ],
          drawings: [
            {
              id: drawing.id,
              name: "Overwrite",
              collectionId: null,
              filePath: "Unorganized/invalid.excalidraw",
            },
          ],
        }),
      );
      zip.file("Unorganized/invalid.excalidraw", JSON.stringify(scene));
      const archive = await zip.generateAsync({ type: "nodebuffer" });
      const res = await agent
        .post("/import/excalidash")
        .set("User-Agent", userAgent)
        .set(csrfHeaderName, csrfToken)
        .attach("archive", archive, "invalid.excalidash");

      expect(res.status).toBe(400);
      expect(
        await prisma.drawing.findUnique({ where: { id: drawing.id } }),
      ).toEqual(drawing);
      expect(
        await prisma.collection.findUnique({
          where: { id: "must-not-create" },
        }),
      ).toBeNull();
      expect(
        await prisma.drawingSnapshot.findMany({
          where: { drawingId: drawing.id },
        }),
      ).toEqual(history);
      expect(
        (await prisma.drawingFile.findUnique({
          where: {
            drawingId_fileId: { drawingId: drawing.id, fileId: "saved-image" },
          },
        }))!.data,
      ).toEqual(Buffer.from("keep saved bytes"));
    },
  );

  it.each(["elements", "appState", "files"])(
    "rejects malformed legacy %s JSON before overwriting a same-ID drawing",
    async (field) => {
      const drawing = await seedDrawingBeforeInvalidImport("legacy-drawing-1");
      const history = await prisma.drawingSnapshot.findMany({
        where: { drawingId: drawing.id },
      });
      const legacyDb = createLegacySqliteDb({
        tableStyle: "prisma",
        includeCollections: true,
        includeMigrationsTable: false,
        includeTrashDrawing: false,
      });
      const db = openWritableDb(legacyDb);
      try {
        db.prepare(`UPDATE "Drawing" SET "${field}" = ? WHERE id = ?`).run(
          "{broken",
          drawing.id,
        );
      } finally {
        db.close();
      }
      const res = await agent
        .post("/import/sqlite/legacy")
        .set("User-Agent", userAgent)
        .set(csrfHeaderName, csrfToken)
        .attach("db", legacyDb);

      expect(res.status).toBe(400);
      expect(
        await prisma.drawing.findUnique({ where: { id: drawing.id } }),
      ).toEqual(drawing);
      expect(await prisma.drawing.count()).toBe(1);
      expect(
        await prisma.drawingSnapshot.findMany({
          where: { drawingId: drawing.id },
        }),
      ).toEqual(history);
      expect(
        (await prisma.drawingFile.findUnique({
          where: {
            drawingId_fileId: { drawingId: drawing.id, fileId: "saved-image" },
          },
        }))!.data,
      ).toEqual(Buffer.from("keep saved bytes"));
      expect(
        await prisma.collection.findUnique({
          where: { id: "legacy-collection-1" },
        }),
      ).toBeNull();
    },
  );

  it.each(["excalidash", "legacy"])(
    "preserves recoverable history and advances live version on same-ID %s import",
    async (format) => {
      const id = format === "legacy" ? "legacy-drawing-1" : "import-existing";
      const drawing = await seedDrawingBeforeInvalidImport(id);
      let pending = agent
        .post(
          format === "legacy" ? "/import/sqlite/legacy" : "/import/excalidash",
        )
        .set("User-Agent", userAgent)
        .set(csrfHeaderName, csrfToken);
      if (format === "legacy") {
        const legacyDb = createLegacySqliteDb({
          tableStyle: "prisma",
          includeCollections: true,
          includeMigrationsTable: false,
          includeTrashDrawing: false,
        });
        pending = pending.attach("db", legacyDb);
      } else {
        const zip = new JSZip();
        zip.file(
          "excalidash.manifest.json",
          JSON.stringify({
            format: "excalidash",
            formatVersion: 1,
            exportedAt: new Date().toISOString(),
            unorganizedFolder: "Unorganized",
            collections: [],
            drawings: [
              {
                id,
                name: "Restored backup",
                version: 1,
                collectionId: null,
                filePath: "Unorganized/drawing.excalidraw",
              },
            ],
          }),
        );
        zip.file(
          "Unorganized/drawing.excalidraw",
          JSON.stringify({ elements: [], appState: {}, files: {} }),
        );
        pending = pending.attach(
          "archive",
          await zip.generateAsync({ type: "nodebuffer" }),
          "valid.excalidash",
        );
      }
      const imported = await pending;
      expect(imported.status).toBe(200);
      const updated = await prisma.drawing.findUnique({ where: { id } });
      expect(updated!.version).toBe(8);
      expect(JSON.parse(updated!.elements)).toEqual([]);
      const snapshots = await prisma.drawingSnapshot.findMany({
        where: { drawingId: id },
      });
      expect(snapshots).toHaveLength(2);
      const backup = snapshots.find(
        (snapshot) => snapshot.version === drawing.version,
      )!;
      expect(backup).toBeDefined();
      expect(decodeSnapshotField(backup.elements)).toBe(drawing.elements);
      expect(decodeSnapshotField(backup.appState)).toBe(drawing.appState);
      expect(decodeSnapshotField(backup.files)).toBe(drawing.files);
      const restored = await agent
        .post(`/drawings/${id}/history/${backup.id}/restore`)
        .set("User-Agent", userAgent)
        .set(csrfHeaderName, csrfToken);
      expect(restored.status).toBe(200);
      expect(restored.body.version).toBe(9);
      expect(restored.body.elements).toEqual(JSON.parse(drawing.elements));
      expect(restored.body.files).toEqual(JSON.parse(drawing.files));
      expect(
        (await prisma.drawingFile.findUnique({
          where: {
            drawingId_fileId: { drawingId: id, fileId: "saved-image" },
          },
        }))!.data,
      ).toEqual(Buffer.from("keep saved bytes"));
    },
  );

  it("rolls back the import scene and safety snapshot if later processing fails", async () => {
    const drawing = await seedDrawingBeforeInvalidImport(
      "failed-import-existing",
    );
    await expect(
      prisma.$transaction(async (tx) => {
        await replaceImportedDrawing(tx, drawing, {
          elements: "[]",
          appState: "{}",
          files: "{}",
        });
        throw new Error("later import processing failed");
      }),
    ).rejects.toThrow("later import processing failed");
    expect(
      await prisma.drawing.findUnique({ where: { id: drawing.id } }),
    ).toEqual(drawing);
    expect(await prisma.drawingSnapshot.count()).toBe(1);
  });

  it("rolls back the safety snapshot when an import loses its version guard", async () => {
    const drawing = await seedDrawingBeforeInvalidImport(
      "conflicting-import-existing",
    );
    await expect(
      prisma.$transaction((tx) =>
        replaceImportedDrawing(
          tx,
          { ...drawing, version: drawing.version - 1 },
          { elements: "[]", files: "{}" },
        ),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await prisma.drawing.findUnique({ where: { id: drawing.id } }),
    ).toEqual(drawing);
    expect(await prisma.drawingSnapshot.count()).toBe(1);
  });

  it.each(["excalidash", "legacy"])(
    "rejects %s import if cleanup reclaims newly interned bytes before scene commit",
    async (format) => {
      const id =
        format === "legacy" ? "legacy-drawing-1" : "reclaimed-import-existing";
      const drawing = await seedDrawingBeforeInvalidImport(id);
      const files = {
        pending: {
          id: "pending",
          dataURL: "data:image/png;base64,AQID",
          mimeType: "image/png",
          created: 1,
        },
      };
      let stateAfterCleanup: typeof drawing | null = null;
      vi.mocked(internDrawingFiles).mockImplementationOnce(async (...args) => {
        const actual =
          await vi.importActual<typeof import("../fileProcessing")>(
            "../fileProcessing",
          );
        const processed = await actual.internDrawingFiles(...args);
        const trimmed = await agent
          .post(`/drawings/${id}/trim`)
          .set("User-Agent", userAgent)
          .set(csrfHeaderName, csrfToken)
          .send({ confirmName: drawing.name });
        expect(trimmed.status).toBe(200);
        expect(
          await prisma.drawingFile.findUnique({
            where: { drawingId_fileId: { drawingId: id, fileId: "pending" } },
          }),
        ).toBeNull();
        stateAfterCleanup = await prisma.drawing.findUnique({ where: { id } });
        return processed;
      });
      let pending = agent
        .post(
          format === "legacy" ? "/import/sqlite/legacy" : "/import/excalidash",
        )
        .set("User-Agent", userAgent)
        .set(csrfHeaderName, csrfToken);
      if (format === "legacy") {
        const legacyDb = createLegacySqliteDb({
          tableStyle: "prisma",
          includeCollections: true,
          includeMigrationsTable: false,
          includeTrashDrawing: false,
        });
        const db = openWritableDb(legacyDb);
        try {
          db.prepare('UPDATE "Drawing" SET files = ? WHERE id = ?').run(
            JSON.stringify(files),
            id,
          );
        } finally {
          db.close();
        }
        pending = pending.attach("db", legacyDb);
      } else {
        const zip = new JSZip();
        zip.file(
          "excalidash.manifest.json",
          JSON.stringify({
            format: "excalidash",
            formatVersion: 1,
            exportedAt: new Date().toISOString(),
            unorganizedFolder: "Unorganized",
            collections: [],
            drawings: [
              {
                id,
                name: "Imported scene",
                version: 1,
                collectionId: null,
                filePath: "Unorganized/drawing.excalidraw",
              },
            ],
          }),
        );
        zip.file(
          "Unorganized/drawing.excalidraw",
          JSON.stringify({ elements: [], appState: {}, files }),
        );
        pending = pending.attach(
          "archive",
          await zip.generateAsync({ type: "nodebuffer" }),
          "reclaimed.excalidash",
        );
      }
      const result = await pending;
      expect(result.status).toBe(409);
      expect(stateAfterCleanup).not.toBeNull();
      expect(await prisma.drawing.findUnique({ where: { id } })).toEqual(
        stateAfterCleanup,
      );
      expect(
        await prisma.drawingSnapshot.count({ where: { drawingId: id } }),
      ).toBe(1);
      if (format === "legacy") {
        expect(
          await prisma.collection.findUnique({
            where: { id: "legacy-collection-1" },
          }),
        ).toBeNull();
        expect(
          await prisma.drawing.findUnique({
            where: { id: "legacy-drawing-2" },
          }),
        ).toBeNull();
      }
    },
  );

  const downloadExport = async (): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      agent
        .get("/export/excalidash")
        .set("User-Agent", userAgent)
        .buffer(true)
        .parse(
          (res: any, callback: (err: Error | null, body: Buffer) => void) => {
            const chunks: Buffer[] = [];
            res.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
            res.on("end", () => callback(null, Buffer.concat(chunks)));
            res.on("error", (err: Error) => callback(err, Buffer.alloc(0)));
          },
        )
        .end((err: Error | null, res: any) =>
          err ? reject(err) : resolve(res.body as Buffer),
        );
    });

  it("leaves excalidraw drawings byte-identical through export + re-import", async () => {
    const elements = [
      { id: "el1", type: "rectangle", x: 0, y: 0, width: 5, height: 5 },
    ];
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
    const manifest = JSON.parse(
      await zip.file("excalidash.manifest.json")!.async("string"),
    );
    const entry = manifest.drawings.find(
      (d: any) => d.id === "excalidraw-roundtrip-1",
    );
    expect(entry.filePath).toMatch(/\.excalidraw$/);

    const res = await agent
      .post("/import/excalidash")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .attach("archive", buffer, "backup.excalidash");

    expect(res.status).toBe(200);

    const row = await prisma.drawing.findUnique({
      where: { id: "excalidraw-roundtrip-1" },
    });
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

  const createBackupImageDrawing = async (files: Record<string, unknown>) =>
    prisma.drawing.create({
      data: {
        id: "backup-images",
        name: "Backup images",
        elements: JSON.stringify([
          { id: "external-element", type: "image", fileId: "external" },
          { id: "managed-element", type: "image", fileId: "managed" },
        ]),
        appState: "{}",
        files: JSON.stringify(files),
        userId: BOOTSTRAP_USER_ID,
      },
    });

  it("verifies and restores shared snapshot image bytes under a 5 MiB upload limit", async () => {
    const uploadLimit = 5 * 1024 * 1024;
    let tightApp: typeof app;
    vi.stubEnv("UPLOAD_MAX_MB", "5");
    try {
      vi.resetModules();
      ({ app: tightApp } = await import("../index"));
    } finally {
      vi.unstubAllEnvs();
    }
    const tightAgent = request.agent(tightApp);
    const csrf = await tightAgent
      .get("/csrf-token")
      .set("User-Agent", userAgent);
    const upload = (endpoint: string, archive: Buffer) =>
      tightAgent
        .post(endpoint)
        .set("User-Agent", userAgent)
        .set(csrf.body.header, csrf.body.token)
        .attach("archive", archive, "backup.excalidash");

    const imageBytes = randomBytes(2 * 1024 * 1024 + 20 * 1024);
    const imageUrl = "/api/files/backup-images/managed";
    const image = { id: "managed", mimeType: "image/png", dataURL: imageUrl };
    const drawing = await createBackupImageDrawing({ managed: image });
    await prisma.drawingFile.create({
      data: {
        drawingId: drawing.id,
        fileId: image.id,
        mimeType: image.mimeType,
        sizeBytes: imageBytes.length,
        storage: "db",
        data: imageBytes,
      },
    });
    const versions = [1, 2];
    for (const version of versions) {
      await prisma.drawingSnapshot.create({
        data: {
          id: `shared-image-history-${version}`,
          drawingId: drawing.id,
          version,
          createdAt: new Date(version * 1000),
          elements: encodeSnapshotField(drawing.elements),
          appState: encodeSnapshotField(drawing.appState),
          files: encodeSnapshotField(
            JSON.stringify({ managed: { ...image, created: version } }),
          ),
        },
      });
    }

    const archive = await downloadExport();
    const zip = await JSZip.loadAsync(archive);
    const manifest = JSON.parse(
      await zip.file("excalidash.manifest.json")!.async("string"),
    );
    const drawingPath = manifest.drawings[0].filePath;
    const raw = await zip.file(drawingPath)!.async("string");
    expect(Buffer.byteLength(raw)).toBeLessThan(uploadLimit);
    const scene = JSON.parse(raw);
    expect(scene.excalidash.history).toHaveLength(versions.length);
    for (const snapshot of scene.excalidash.history) {
      expect(snapshot.sharedFileIds).toEqual([image.id]);
      expect(snapshot.files.managed).toEqual({
        id: image.id,
        mimeType: image.mimeType,
        created: snapshot.version,
      });
    }

    await cleanupTestDb(prisma);
    await prisma.drawingFile.deleteMany({});
    const verified = await upload("/import/excalidash/verify", archive);
    expect(verified.status).toBe(200);
    const restored = await upload("/import/excalidash", archive);
    expect(restored.status).toBe(200);
    const live = await prisma.drawing.findUniqueOrThrow({
      where: { id: drawing.id },
      include: { snapshots: { orderBy: { version: "asc" } } },
    });
    expect(JSON.parse(live.files).managed).toEqual(image);
    expect(live.snapshots.map((snapshot) => snapshot.version)).toEqual(
      versions,
    );
    for (const snapshot of live.snapshots) {
      expect(JSON.parse(decodeSnapshotField(snapshot.files)).managed).toEqual({
        ...image,
        created: snapshot.version,
      });
    }
    const stored = await prisma.drawingFile.findMany({
      where: { drawingId: drawing.id },
    });
    expect(stored).toHaveLength(1);
    expect(Buffer.from(stored[0].data!).equals(imageBytes)).toBe(true);

    // The old encoding fits as a ZIP but exceeds the extracted entry limit.
    const [firstSnapshot] = scene.excalidash.history;
    delete firstSnapshot.sharedFileIds;
    firstSnapshot.files.managed.dataURL = scene.files.managed.dataURL;
    scene.excalidash.history = [firstSnapshot];
    zip.file(drawingPath, JSON.stringify(scene));
    const legacy = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    });
    expect(legacy.length).toBeLessThan(uploadLimit);
    for (const endpoint of [
      "/import/excalidash/verify",
      "/import/excalidash",
    ]) {
      const rejected = await upload(endpoint, legacy);
      expect(rejected.status).toBe(400);
      expect(rejected.body.message).toBe(
        `Drawing is too large: ${drawingPath}`,
      );
    }

    await cleanupTestDb(prisma);
    await prisma.drawingFile.deleteMany({});
    const legacyRestore = await agent
      .post("/import/excalidash")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .attach("archive", legacy, "backup.excalidash");
    expect(legacyRestore.status).toBe(200);
    const legacySnapshot = await prisma.drawingSnapshot.findUniqueOrThrow({
      where: { id: firstSnapshot.id },
    });
    expect(
      JSON.parse(decodeSnapshotField(legacySnapshot.files)).managed.dataURL,
    ).toBe(imageUrl);
  });

  it("round-trips unmanaged HTTP(S) references alongside bundled managed images", async () => {
    const externalUrls = {
      external: "https://external.example/imported.png?version=1",
      legacy: "http://legacy.example/image.png",
    };
    const externalFiles = Object.fromEntries(
      Object.entries(externalUrls).map(([id, dataURL]) => [
        id,
        { id, mimeType: "image/png", dataURL, created: 123 },
      ]),
    );
    const imageBytes = Buffer.from("round-trip managed image");
    const drawing = await createBackupImageDrawing({
      ...externalFiles,
      managed: {
        id: "managed",
        mimeType: "image/png",
        dataURL: "https://cdn.example/managed.png",
      },
    });
    await prisma.drawingFile.create({
      data: {
        drawingId: drawing.id,
        fileId: "managed",
        mimeType: "image/png",
        sizeBytes: imageBytes.length,
        storage: "db",
        data: imageBytes,
      },
    });

    const buffer = await downloadExport();
    const zip = await JSZip.loadAsync(buffer);
    const manifest = JSON.parse(
      await zip.file("excalidash.manifest.json")!.async("string"),
    );
    const exported = JSON.parse(
      await zip.file(manifest.drawings[0].filePath)!.async("string"),
    );
    expect(exported.files).toMatchObject(externalFiles);
    expect(exported.files.managed.dataURL).toBe(
      `data:image/png;base64,${imageBytes.toString("base64")}`,
    );
    expect(exported.elements).toEqual(JSON.parse(drawing.elements));
    expect(downloadBuffer).not.toHaveBeenCalled();

    // Restore into an empty account so this exercises creation and interning.
    await cleanupTestDb(prisma);
    await prisma.drawingFile.deleteMany({});
    const imported = await agent
      .post("/import/excalidash")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .attach("archive", buffer, "backup.excalidash");
    expect(imported.status).toBe(200);
    const restored = await prisma.drawing.findUniqueOrThrow({
      where: { id: drawing.id },
    });
    for (const [fileId, dataURL] of Object.entries(externalUrls)) {
      expect(JSON.parse(restored.files)[fileId]).toMatchObject({
        id: fileId,
        mimeType: "image/png",
        dataURL,
      });
    }
    expect(JSON.parse(restored.elements)).toEqual(exported.elements);
    expect(JSON.parse(restored.files).managed.dataURL).toBe(
      `/api/files/${drawing.id}/managed`,
    );
    const stored = await prisma.drawingFile.findMany({
      where: { drawingId: drawing.id },
    });
    expect(stored).toHaveLength(1);
    expect(stored[0].fileId).toBe("managed");
    expect(Buffer.from(stored[0].data!)).toEqual(imageBytes);
    expect(downloadBuffer).not.toHaveBeenCalled();
    expect(await downloadExport()).toEqual(expect.any(Buffer));
  });

  it("exports dangling legacy image references with warnings and preserves compressed history on restore", async () => {
    const missingFiles = Object.fromEntries(
      ["missing-1", "missing-2", "deleted-1", "deleted-2"].map((id) => [
        id,
        {
          id,
          mimeType: "image/png",
          dataURL: `/api/files/deleted-source/${id}`,
          created: 123,
        },
      ]),
    );
    const drawing = await createBackupImageDrawing(missingFiles);
    const historyElements = [
      { id: "old-element", type: "image", fileId: "history-only" },
    ];
    const historyBytes = Buffer.from("retained historical image");
    const historyFiles = {
      ...missingFiles,
      "history-only": {
        id: "history-only",
        mimeType: "image/png",
        dataURL: `/api/files/${drawing.id}/history-only`,
      },
    };
    const snapshot = await prisma.drawingSnapshot.create({
      data: {
        id: "retained-snapshot",
        drawingId: drawing.id,
        version: 0,
        elements: encodeSnapshotField(JSON.stringify(historyElements)),
        appState: encodeSnapshotField(
          JSON.stringify({ viewBackgroundColor: "#123456" }),
        ),
        files: encodeSnapshotField(JSON.stringify(historyFiles)),
        createdAt: new Date("2026-09-01T12:00:00Z"),
      },
    });
    await prisma.drawingFile.create({
      data: {
        drawingId: drawing.id,
        fileId: "history-only",
        mimeType: "image/png",
        storage: "db",
        data: historyBytes,
        sizeBytes: historyBytes.length,
      },
    });
    const blocked = await agent
      .get("/export/excalidash")
      .set("User-Agent", userAgent);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("BACKUP_MISSING_IMAGES");
    expect(blocked.headers["content-disposition"]).toBeUndefined();
    const response = await agent
      .get("/export/excalidash?recovery=1")
      .set("User-Agent", userAgent)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
        res.on("error", callback);
      });
    expect(response.status).toBe(200);
    expect(response.headers["x-excalidash-missing-images"]).toBe("4");
    const zip = await JSZip.loadAsync(response.body);
    const manifest = JSON.parse(
      await zip.file("excalidash.manifest.json")!.async("string"),
    );
    expect(manifest.missingImages).toHaveLength(4);
    const scene = JSON.parse(
      await zip.file(manifest.drawings[0].filePath)!.async("string"),
    );
    expect(scene.files).toEqual(missingFiles);
    expect(scene.excalidash.history[0].files["history-only"].dataURL).toBe(
      `data:image/png;base64,${historyBytes.toString("base64")}`,
    );
    expect(scene.excalidash.history[0].elements).toEqual(historyElements);
    // Export is read-only, including the original compressed snapshot payload.
    expect(
      await prisma.drawingSnapshot.findUnique({ where: { id: snapshot.id } }),
    ).toEqual(snapshot);
    await cleanupTestDb(prisma);
    await prisma.drawingFile.deleteMany({});
    const verify = await agent
      .post("/import/excalidash/verify")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .attach("archive", response.body, "backup.excalidash");
    expect(verify.status).toBe(200);
    expect(verify.body.missingImages).toBe(4);
    const restored = await agent
      .post("/import/excalidash")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .attach("archive", response.body, "backup.excalidash");
    expect(restored.status).toBe(200);
    const live = await prisma.drawing.findUniqueOrThrow({
      where: { id: drawing.id },
    });
    expect(JSON.parse(live.elements)).toEqual(JSON.parse(drawing.elements));
    expect(JSON.parse(live.files)).toEqual(missingFiles);
    const retained = await prisma.drawingSnapshot.findUniqueOrThrow({
      where: { id: snapshot.id },
    });
    expect(retained.version).toBe(snapshot.version);
    expect(retained.createdAt).toEqual(snapshot.createdAt);
    expect(JSON.parse(decodeSnapshotField(retained.elements))).toEqual(
      historyElements,
    );
    expect(
      JSON.parse(decodeSnapshotField(retained.files))["history-only"].dataURL,
    ).toBe(`/api/files/${drawing.id}/history-only`);
    const bytes = await prisma.drawingFile.findUniqueOrThrow({
      where: {
        drawingId_fileId: { drawingId: drawing.id, fileId: "history-only" },
      },
    });
    expect(Buffer.from(bytes.data!)).toEqual(historyBytes);
    // Merging the same archive retains history without duplicating its IDs.
    const again = await agent
      .post("/import/excalidash")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .attach("archive", response.body, "backup.excalidash");
    expect(again.status).toBe(200);
    expect(
      await prisma.drawingSnapshot.count({ where: { id: snapshot.id } }),
    ).toBe(1);
  });

  it.each(["db", "s3"])(
    "preserves complete live scenes, historical scenes and %s image bytes through an empty-account restore",
    async (storage) => {
      const drawing = await createBackupImageDrawing({
        managed: {
          id: "managed",
          mimeType: "image/png",
          dataURL: "/api/files/backup-images/managed",
        },
      });
      const oldFiles = {
        previous: {
          id: "previous",
          mimeType: "image/png",
          dataURL: "/api/files/backup-images/previous",
          created: 456,
        },
      };
      const snapshot = await prisma.drawingSnapshot.create({
        data: {
          id: "complete-history",
          drawingId: drawing.id,
          version: 0,
          elements: encodeSnapshotField(
            JSON.stringify([
              { id: "old-shape", type: "image", fileId: "previous" },
            ]),
          ),
          appState: encodeSnapshotField(
            JSON.stringify({ viewBackgroundColor: "#123456" }),
          ),
          files: encodeSnapshotField(JSON.stringify(oldFiles)),
        },
      });
      const bytesById = {
        managed: Buffer.from("live image"),
        previous: Buffer.from("historical image"),
      };
      for (const [fileId, data] of Object.entries(bytesById))
        await prisma.drawingFile.create({
          data: {
            drawingId: drawing.id,
            fileId,
            mimeType: "image/png",
            sizeBytes: data.length,
            storage,
            data: storage === "db" ? data : null,
            s3Key: storage === "s3" ? `fixture/${fileId}.png` : null,
          },
        });
      vi.mocked(downloadBuffer).mockImplementation(
        async (key) =>
          bytesById[key.includes("previous") ? "previous" : "managed"],
      );
      const archive = await downloadExport();
      const zip = await JSZip.loadAsync(archive);
      const manifest = JSON.parse(
        await zip.file("excalidash.manifest.json")!.async("string"),
      );
      expect(manifest.missingImages).toEqual([]);
      const scene = JSON.parse(
        await zip.file(manifest.drawings[0].filePath)!.async("string"),
      );
      expect(scene.elements).toEqual(JSON.parse(drawing.elements));
      expect(scene.excalidash.history).toHaveLength(1);
      await cleanupTestDb(prisma);
      await prisma.drawingFile.deleteMany({});
      const imported = await agent
        .post("/import/excalidash")
        .set("User-Agent", userAgent)
        .set(csrfHeaderName, csrfToken)
        .attach("archive", archive, "backup.excalidash");
      expect(imported.status).toBe(200);
      const live = await prisma.drawing.findUniqueOrThrow({
        where: { id: drawing.id },
      });
      expect(live.version).toBe(drawing.version);
      expect(JSON.parse(live.elements)).toEqual(scene.elements);
      expect(JSON.parse(live.appState)).toEqual(scene.appState);
      const retained = await prisma.drawingSnapshot.findUniqueOrThrow({
        where: { id: snapshot.id },
      });
      expect(JSON.parse(decodeSnapshotField(retained.elements))).toEqual(
        scene.excalidash.history[0].elements,
      );
      expect(JSON.parse(decodeSnapshotField(retained.appState))).toEqual(
        scene.excalidash.history[0].appState,
      );
      expect(retained.createdAt).toEqual(snapshot.createdAt);
      for (const [fileId, data] of Object.entries(bytesById)) {
        const row = await prisma.drawingFile.findUniqueOrThrow({
          where: { drawingId_fileId: { drawingId: drawing.id, fileId } },
        });
        expect(Buffer.from(row.data!)).toEqual(data);
      }
      const restoredSnapshot = await agent
        .post(`/drawings/${drawing.id}/history/${snapshot.id}/restore`)
        .set("User-Agent", userAgent)
        .set(csrfHeaderName, csrfToken)
        .send({});
      expect(restoredSnapshot.status).toBe(200);
      const historical = await prisma.drawing.findUniqueOrThrow({
        where: { id: drawing.id },
      });
      expect(JSON.parse(historical.elements)).toEqual(
        scene.excalidash.history[0].elements,
      );
      expect(JSON.parse(historical.files).previous.dataURL).toBe(
        `/api/files/${drawing.id}/previous`,
      );
    },
  );

  it.each(["backup", "legacy"])(
    "rejects unresolved managed references in an ordinary %s import without changing scenes or history",
    async (format) => {
      const existing = await prisma.drawing.create({
        data: {
          id: "legacy-drawing-1",
          name: "Keep me",
          elements: "[]",
          appState: "{}",
          files: "{}",
          userId: BOOTSTRAP_USER_ID,
        },
      });
      const dangling = {
        image: {
          id: "image",
          mimeType: "image/png",
          dataURL: "/api/files/deleted-source/image",
        },
      };
      let payload: Buffer | string;
      if (format === "legacy") {
        payload = createLegacySqliteDb({
          tableStyle: "prisma",
          includeCollections: true,
          includeMigrationsTable: false,
          includeTrashDrawing: false,
        });
        const db = openWritableDb(payload);
        db.prepare("UPDATE Drawing SET files = ? WHERE id = ?").run(
          JSON.stringify(dangling),
          existing.id,
        );
        db.close();
      } else {
        const zip = new JSZip();
        zip.file(
          "excalidash.manifest.json",
          JSON.stringify({
            format: "excalidash",
            formatVersion: 1,
            exportedAt: new Date().toISOString(),
            unorganizedFolder: "Unorganized",
            collections: [],
            drawings: [
              {
                id: existing.id,
                name: "Do not replace",
                filePath: "drawing.excalidraw",
                collectionId: null,
              },
            ],
          }),
        );
        zip.file(
          "drawing.excalidraw",
          JSON.stringify({ elements: [], appState: {}, files: dangling }),
        );
        payload = await zip.generateAsync({ type: "nodebuffer" });
      }
      const result = await agent
        .post(
          format === "legacy" ? "/import/sqlite/legacy" : "/import/excalidash",
        )
        .set("User-Agent", userAgent)
        .set(csrfHeaderName, csrfToken)
        .attach(
          format === "legacy" ? "db" : "archive",
          payload,
          format === "legacy" ? "fixture.db" : "fixture.excalidash",
        );
      expect(result.status).toBe(400);
      expect(result.body.message).toContain(
        "unresolved drawing image references",
      );
      expect(
        await prisma.drawing.findUnique({ where: { id: existing.id } }),
      ).toEqual(existing);
      expect(await prisma.drawingSnapshot.count()).toBe(0);
      expect(await prisma.collection.count()).toBe(0);
    },
  );

  it.each(
    ["missing db bytes", "missing s3 key", "s3 missing", "s3 error"].flatMap(
      (failure) =>
        [false, true].map((recovery) => [failure, recovery] as const),
    ),
  )(
    "returns a complete HTTP 500 before streaming when managed storage has %s (recovery=%s)",
    async (failure, recovery) => {
      const drawing = await createBackupImageDrawing({
        managed: {
          id: "managed",
          mimeType: "image/png",
          dataURL: "https://cdn.example/managed.png",
        },
        external: {
          id: "external",
          mimeType: "image/png",
          dataURL: "https://external.example/image.png",
        },
      });
      {
        await prisma.drawingFile.create({
          data: {
            drawingId: drawing.id,
            fileId: "managed",
            mimeType: "image/png",
            sizeBytes: 42,
            storage: failure === "missing db bytes" ? "db" : "s3",
            s3Key: failure.startsWith("s3 ") ? "managed/image.png" : null,
            data: null,
          },
        });
      }
      vi.mocked(downloadBuffer).mockRejectedValue(
        new Error(
          failure === "s3 missing" ? "NoSuchKey" : "storage unavailable",
        ),
      );
      const response = await agent
        .get("/export/excalidash")
        .set("User-Agent", userAgent)
        .query(recovery ? { recovery: "1" } : {})
        .timeout({ response: 5000, deadline: 10000 });
      expect(response.status).toBe(500);
      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.headers["content-disposition"]).toBeUndefined();
      expect(response.body.error).toBe("Internal server error");
      expect(downloadBuffer).toHaveBeenCalledTimes(
        failure.startsWith("s3 ") ? 1 : 0,
      );
    },
  );
});
