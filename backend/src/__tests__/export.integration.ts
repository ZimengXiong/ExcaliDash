/**
 * Integration tests for export routes
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express, { Express } from "express";
import request from "supertest";
import fs from "fs";
import path from "path";
import { PrismaClient } from "../generated/client";
import { createExportRouter } from "../routes/export";
import { getTestPrisma, setupTestDb, cleanupTestDb, initTestDb } from "./testUtils";

let app: Express;
let prisma: PrismaClient;
const testUploadDir = path.join(__dirname, "test-uploads");
const testDbPath = path.join(__dirname, "../../prisma/test.db");

beforeAll(async () => {
  setupTestDb();
  prisma = getTestPrisma();
  await initTestDb(prisma);

  // Create test upload directory
  if (!fs.existsSync(testUploadDir)) {
    fs.mkdirSync(testUploadDir, { recursive: true });
  }

  // Create Express app with export routes
  app = express();
  app.use(express.json());
  app.use(
    "/export",
    createExportRouter({
      prisma,
      uploadDir: testUploadDir,
      getResolvedDbPath: () => testDbPath,
    })
  );
  // Also mount import routes
  app.use(
    "/import",
    createExportRouter({
      prisma,
      uploadDir: testUploadDir,
      getResolvedDbPath: () => testDbPath,
    })
  );
});

afterAll(async () => {
  await prisma.$disconnect();
  // Clean up test upload directory
  if (fs.existsSync(testUploadDir)) {
    const files = fs.readdirSync(testUploadDir);
    for (const file of files) {
      fs.unlinkSync(path.join(testUploadDir, file));
    }
    fs.rmdirSync(testUploadDir);
  }
});

beforeEach(async () => {
  await cleanupTestDb(prisma);
});

describe("Export Routes", () => {
  describe("GET /export", () => {
    it("should export database as SQLite file", async () => {
      const res = await request(app).get("/export");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("application/octet-stream");
      expect(res.headers["content-disposition"]).toMatch(/attachment.*\.sqlite/);
    });

    it("should export with .db extension when format=db", async () => {
      const res = await request(app).get("/export?format=db");
      expect(res.status).toBe(200);
      expect(res.headers["content-disposition"]).toMatch(/\.db"/);
    });

    it("should export with .sqlite extension when format=sqlite", async () => {
      const res = await request(app).get("/export?format=sqlite");
      expect(res.status).toBe(200);
      expect(res.headers["content-disposition"]).toMatch(/\.sqlite"/);
    });
  });

  describe("GET /export/json", () => {
    it("should export empty drawings as ZIP", async () => {
      const res = await request(app).get("/export/json");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("application/zip");
      expect(res.headers["content-disposition"]).toMatch(/attachment.*\.zip/);
    });

    it("should export drawings as ZIP with content", async () => {
      // Create a test drawing
      await prisma.drawing.create({
        data: {
          name: "Test Drawing",
          elements: JSON.stringify([{ id: "elem1", type: "rectangle" }]),
          appState: JSON.stringify({ viewBackgroundColor: "#ffffff" }),
        },
      });

      const res = await request(app)
        .get("/export/json")
        .responseType("blob");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("application/zip");
      // ZIP should have some content (Buffer)
      expect(Buffer.isBuffer(res.body)).toBe(true);
      expect(res.body.byteLength).toBeGreaterThan(0);
    });

    it("should organize drawings by collection in ZIP", async () => {
      const collection = await prisma.collection.create({
        data: { name: "My Collection" },
      });

      await prisma.drawing.create({
        data: {
          name: "Drawing in Collection",
          elements: "[]",
          appState: "{}",
          collectionId: collection.id,
        },
      });

      await prisma.drawing.create({
        data: {
          name: "Unorganized Drawing",
          elements: "[]",
          appState: "{}",
        },
      });

      const res = await request(app).get("/export/json");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("application/zip");
    });
  });

  describe("POST /import/sqlite/verify", () => {
    it("should reject request without file", async () => {
      const res = await request(app).post("/import/sqlite/verify");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("No file uploaded");
    });

    it("should reject invalid SQLite file", async () => {
      // Create a temporary invalid file
      const invalidFilePath = path.join(testUploadDir, "invalid.db");
      fs.writeFileSync(invalidFilePath, "This is not a SQLite database");

      const res = await request(app)
        .post("/import/sqlite/verify")
        .attach("db", invalidFilePath);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid database format");

      // Clean up
      if (fs.existsSync(invalidFilePath)) {
        fs.unlinkSync(invalidFilePath);
      }
    });

    it("should accept valid SQLite file", async () => {
      // The test database itself should be valid
      const res = await request(app)
        .post("/import/sqlite/verify")
        .attach("db", testDbPath);

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
    });
  });
});

describe("Import Routes Error Handling", () => {
  it("should reject non-.db/.sqlite files in verify endpoint", async () => {
    const invalidFilePath = path.join(testUploadDir, "invalid.txt");
    fs.writeFileSync(invalidFilePath, "Not a database");

    const res = await request(app)
      .post("/import/sqlite/verify")
      .attach("db", invalidFilePath);

    // Multer should reject the file based on extension
    expect(res.status).toBe(500);

    // Clean up
    if (fs.existsSync(invalidFilePath)) {
      fs.unlinkSync(invalidFilePath);
    }
  });
});

describe("Export Routes Edge Cases", () => {
  it("should handle empty database in export", async () => {
    // Delete all drawings
    await prisma.drawing.deleteMany({});

    const res = await request(app).get("/export");
    expect(res.status).toBe(200);
  });

  it("should handle drawings with special characters in name", async () => {
    await prisma.drawing.create({
      data: {
        name: 'Test <Drawing> "Special" / \\ Characters',
        elements: "[]",
        appState: "{}",
      },
    });

    const res = await request(app).get("/export/json").responseType("blob");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
  });

  it("should handle collection with special characters in name", async () => {
    const collection = await prisma.collection.create({
      data: { name: 'My <Collection> "Test" | Special?' },
    });

    await prisma.drawing.create({
      data: {
        name: "Drawing in Special Collection",
        elements: "[]",
        appState: "{}",
        collectionId: collection.id,
      },
    });

    const res = await request(app).get("/export/json").responseType("blob");
    expect(res.status).toBe(200);
  });

  it("should handle drawings with files in JSON export", async () => {
    await prisma.drawing.create({
      data: {
        name: "Drawing with Files",
        elements: JSON.stringify([{ id: "elem1", type: "image", fileId: "file1" }]),
        appState: "{}",
        files: JSON.stringify({
          file1: { dataURL: "data:image/png;base64,abc123", mimeType: "image/png" },
        }),
      },
    });

    const res = await request(app).get("/export/json").responseType("blob");
    expect(res.status).toBe(200);
  });
});

describe("SQLite Import Route", () => {
  it("should reject import without file", async () => {
    const res = await request(app).post("/import/sqlite");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("No file uploaded");
  });

  it("should reject invalid database during import", async () => {
    const invalidFilePath = path.join(testUploadDir, "invalid-import.db");
    fs.writeFileSync(invalidFilePath, "This is not a valid SQLite database");

    const res = await request(app)
      .post("/import/sqlite")
      .attach("db", invalidFilePath);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid|integrity/i);

    // Clean up
    if (fs.existsSync(invalidFilePath)) {
      fs.unlinkSync(invalidFilePath);
    }
  });

  it("should reject file that is too small to be SQLite", async () => {
    const tinyFilePath = path.join(testUploadDir, "tiny.db");
    // Write less than 16 bytes
    fs.writeFileSync(tinyFilePath, "tiny");

    const res = await request(app)
      .post("/import/sqlite/verify")
      .attach("db", tinyFilePath);

    expect(res.status).toBe(400);

    // Clean up
    if (fs.existsSync(tinyFilePath)) {
      fs.unlinkSync(tinyFilePath);
    }
  });

  it("should reject file with wrong SQLite header", async () => {
    const wrongHeaderPath = path.join(testUploadDir, "wrong-header.db");
    // Write 16+ bytes but with wrong header
    fs.writeFileSync(wrongHeaderPath, "This is definitely not SQLite format 3!");

    const res = await request(app)
      .post("/import/sqlite/verify")
      .attach("db", wrongHeaderPath);

    expect(res.status).toBe(400);

    // Clean up
    if (fs.existsSync(wrongHeaderPath)) {
      fs.unlinkSync(wrongHeaderPath);
    }
  });
});

describe("Database Export Error Handling", () => {
  it("should handle export when database exists", async () => {
    const res = await request(app).get("/export");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/octet-stream");
  });
});
