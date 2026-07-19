import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";
import { createExcalidashArchiveWithDuplicateDrawingIds } from "./importsCompatFixtures";
import { cleanupTestDb, getTestPrisma, setupTestDb } from "./testUtils";

describe("ExcaliDash archive imports", () => {
  const uploadsDir = path.resolve(__dirname, "../../uploads");
  const userAgent = "vitest-excalidash-import";
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
  });

  beforeEach(async () => {
    await cleanupTestDb(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.each(["drawing.excalidraw", "drawing.json", "backup.zip", "backup.excalidash.zip"])(
    "rejects unsupported file name %s during verification",
    async (fileName) => {
      const archive = await createExcalidashArchiveWithDuplicateDrawingIds();
      const res = await agent
        .post("/import/excalidash/verify")
        .set("User-Agent", userAgent)
        .set(csrfHeaderName, csrfToken)
        .attach("archive", archive, fileName);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("A .excalidash file is required.");
    },
  );

  it("rejects a legacy extension during import", async () => {
    const archive = await createExcalidashArchiveWithDuplicateDrawingIds();
    const res = await agent
      .post("/import/excalidash")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .attach("archive", archive, "backup.zip");

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("A .excalidash file is required.");
  });

  it("rejects .excalidash verification when the manifest has duplicate drawing IDs", async () => {
    const archive = await createExcalidashArchiveWithDuplicateDrawingIds();
    const res = await agent
      .post("/import/excalidash/verify")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .attach("archive", archive);

    expect(res.status).toBe(400);
    expect(String(res.body.message || "")).toContain("Duplicate drawing id");
  });

  it("rejects .excalidash import when the manifest has duplicate drawing IDs", async () => {
    const archive = await createExcalidashArchiveWithDuplicateDrawingIds();
    const res = await agent
      .post("/import/excalidash")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .attach("archive", archive);

    expect(res.status).toBe(400);
    expect(String(res.body.message || "")).toContain("Duplicate drawing id");
  });

  it("removes legacy SQLite import routes", async () => {
    const res = await agent
      .post("/import/sqlite/legacy/verify")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken);

    expect(res.status).toBe(404);
  });
});
