/**
 * Integration tests for storage management routes:
 *   POST   /drawings/:id/trim
 *   GET    /drawings/:id/files/diff
 *   DELETE /drawings/:id/files/orphans
 *
 * Exercises the real Express handlers via supertest. S3 is not
 * configured in the test environment, so the trim/orphans handlers
 * skip their S3-side branches — we cover the SQLite-side semantics:
 *   - confirmName guard (403)
 *   - non-owner 404
 *   - version monotonicity (regression for the version-reset bug)
 *   - active fileId protection (400)
 *   - deleted-element cleanup on orphan delete
 *   - diff response shape
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { StringValue } from "ms";
import { PrismaClient } from "../generated/client";
import { config } from "../config";
import { getTestPrisma, setupTestDb, cleanupTestDb } from "./testUtils";

describe("Storage management routes", () => {
  const userAgent = "vitest-storage";
  let prisma: PrismaClient;
  let app: any;
  let agent: any;
  let csrfHeaderName: string;
  let csrfToken: string;
  let owner: { id: string; email: string };
  let other: { id: string; email: string };
  let ownerToken: string;
  let otherToken: string;

  const signToken = (userId: string, email: string) => {
    const opts: SignOptions = {
      expiresIn: config.jwtAccessExpiresIn as StringValue,
    };
    return jwt.sign({ userId, email, type: "access" }, config.jwtSecret, opts);
  };

  const createDrawing = async (
    userId: string,
    overrides: {
      name?: string;
      elements?: any[];
      files?: Record<string, any>;
      version?: number;
    } = {}
  ) => {
    return prisma.drawing.create({
      data: {
        name: overrides.name ?? "My Drawing",
        elements: JSON.stringify(overrides.elements ?? []),
        appState: "{}",
        files: JSON.stringify(overrides.files ?? {}),
        userId,
        version: overrides.version ?? 1,
      },
    });
  };

  const fileEntry = (id: string) => ({
    id,
    mimeType: "image/png",
    dataURL: "data:image/png;base64,AAAA",
    created: Date.now(),
  });

  const imageElement = (
    elId: string,
    fileId: string,
    isDeleted = false
  ) => ({
    id: elId,
    type: "image",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    isDeleted,
    fileId,
  });

  beforeAll(async () => {
    setupTestDb();
    prisma = getTestPrisma();
    ({ app } = await import("../index"));

    await prisma.systemConfig.upsert({
      where: { id: "default" },
      update: { authEnabled: true, registrationEnabled: false },
      create: {
        id: "default",
        authEnabled: true,
        registrationEnabled: false,
      },
    });

    // CSRF middleware rejects unauth'd state-changing requests; obtain a
    // token once and reuse it on every mutating call.
    agent = request.agent(app);
    const csrfRes = await agent
      .get("/csrf-token")
      .set("User-Agent", userAgent);
    csrfHeaderName = csrfRes.body.header;
    csrfToken = csrfRes.body.token;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanupTestDb(prisma);
    await prisma.s3File.deleteMany({});
    await prisma.user.deleteMany({});

    const passwordHash = await bcrypt.hash("password123", 10);
    const ownerRow = await prisma.user.create({
      data: {
        email: "owner@test.local",
        passwordHash,
        name: "Owner",
        role: "USER",
        isActive: true,
      },
      select: { id: true, email: true },
    });
    const otherRow = await prisma.user.create({
      data: {
        email: "other@test.local",
        passwordHash,
        name: "Other",
        role: "USER",
        isActive: true,
      },
      select: { id: true, email: true },
    });
    owner = ownerRow;
    other = otherRow;
    ownerToken = signToken(owner.id, owner.email);
    otherToken = signToken(other.id, other.email);
  });

  describe("POST /drawings/:id/trim", () => {
    it("removes deleted elements and orphan file entries, bumps version", async () => {
      const drawing = await createDrawing(owner.id, {
        name: "Trim Me",
        elements: [
          imageElement("el-keep", "file-keep"),
          imageElement("el-drop", "file-drop", true),
        ],
        files: {
          "file-keep": fileEntry("file-keep"),
          "file-drop": fileEntry("file-drop"),
          "file-unreferenced": fileEntry("file-unreferenced"),
        },
        version: 7,
      });

      const res = await agent
        .post(`/drawings/${drawing.id}/trim`)
        .set("User-Agent", userAgent)
        .set(csrfHeaderName, csrfToken)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ confirmName: "Trim Me" });

      expect(res.status).toBe(200);
      expect(res.body.trimmed).toMatchObject({
        elementsRemoved: 1,
        filesRemoved: 2,
      });

      const after = await prisma.drawing.findUniqueOrThrow({
        where: { id: drawing.id },
      });
      const elements = JSON.parse(after.elements) as any[];
      const files = JSON.parse(after.files) as Record<string, unknown>;
      expect(elements.map((e) => e.id)).toEqual(["el-keep"]);
      expect(Object.keys(files)).toEqual(["file-keep"]);
      // Regression: trim used to reset version to 1, which would
      // silently overwrite a concurrent editor's newer version.
      expect(after.version).toBe(8);
    });

    it("rejects when confirmName does not match", async () => {
      const drawing = await createDrawing(owner.id, { name: "My Drawing" });

      const res = await agent
        .post(`/drawings/${drawing.id}/trim`)
        .set("User-Agent", userAgent)
        .set(csrfHeaderName, csrfToken)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ confirmName: "Wrong Name" });

      expect(res.status).toBe(403);
    });

    it("returns 404 when caller is not the owner", async () => {
      const drawing = await createDrawing(owner.id);

      const res = await agent
        .post(`/drawings/${drawing.id}/trim`)
        .set("User-Agent", userAgent)
        .set(csrfHeaderName, csrfToken)
        .set("Authorization", `Bearer ${otherToken}`)
        .send({ confirmName: drawing.name });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /drawings/:id/files/orphans", () => {
    it("removes the requested fileIds and their soft-deleted elements", async () => {
      const drawing = await createDrawing(owner.id, {
        name: "Orphan Cleanup",
        elements: [
          imageElement("el-active", "file-active"),
          imageElement("el-deleted", "file-orphan", true),
        ],
        files: {
          "file-active": fileEntry("file-active"),
          "file-orphan": fileEntry("file-orphan"),
        },
        version: 3,
      });

      const res = await agent
        .delete(`/drawings/${drawing.id}/files/orphans`)
        .set("User-Agent", userAgent)
        .set(csrfHeaderName, csrfToken)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ confirmName: "Orphan Cleanup", fileIds: ["file-orphan"] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ deleted: 1, errors: 0 });

      const after = await prisma.drawing.findUniqueOrThrow({
        where: { id: drawing.id },
      });
      const elements = JSON.parse(after.elements) as any[];
      const files = JSON.parse(after.files) as Record<string, unknown>;
      // file-orphan is gone from files; the soft-deleted element that
      // referenced it is also gone, so it doesn't reappear in /diff.
      expect(Object.keys(files)).toEqual(["file-active"]);
      expect(elements.map((e) => e.id)).toEqual(["el-active"]);
      // Version should bump so concurrent editors reload.
      expect(after.version).toBe(4);
    });

    it("rejects deletion of fileIds still referenced by active elements", async () => {
      const drawing = await createDrawing(owner.id, {
        name: "Active Refs",
        elements: [imageElement("el-active", "file-active")],
        files: { "file-active": fileEntry("file-active") },
      });

      const res = await agent
        .delete(`/drawings/${drawing.id}/files/orphans`)
        .set("User-Agent", userAgent)
        .set(csrfHeaderName, csrfToken)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ confirmName: "Active Refs", fileIds: ["file-active"] });

      expect(res.status).toBe(400);
      expect(res.body.blockedFileIds).toEqual(["file-active"]);
    });

    it("rejects an empty fileIds payload with 400", async () => {
      const drawing = await createDrawing(owner.id);

      const res = await agent
        .delete(`/drawings/${drawing.id}/files/orphans`)
        .set("User-Agent", userAgent)
        .set(csrfHeaderName, csrfToken)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ confirmName: drawing.name, fileIds: [] });

      expect(res.status).toBe(400);
    });

    it("rejects when confirmName does not match", async () => {
      const drawing = await createDrawing(owner.id, {
        name: "Real",
        files: { "file-x": fileEntry("file-x") },
      });

      const res = await agent
        .delete(`/drawings/${drawing.id}/files/orphans`)
        .set("User-Agent", userAgent)
        .set(csrfHeaderName, csrfToken)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ confirmName: "Wrong", fileIds: ["file-x"] });

      expect(res.status).toBe(403);
    });
  });

  describe("GET /drawings/:id/files/diff", () => {
    it("reports canvas vs sqlite presence per fileId", async () => {
      const drawing = await createDrawing(owner.id, {
        name: "Diff Me",
        elements: [
          imageElement("el-a", "file-a"),
          imageElement("el-b", "file-b", true),
        ],
        files: {
          "file-a": fileEntry("file-a"),
          "file-b": fileEntry("file-b"),
          "file-c": fileEntry("file-c"),
        },
      });

      const res = await agent
        .get(`/drawings/${drawing.id}/files/diff`)
        .set("User-Agent", userAgent)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.summary).toMatchObject({
        totalCanvasRefs: 2, // active only
        totalSqliteFiles: 3,
      });

      type DiffRow = {
        fileId: string;
        inCanvas: boolean;
        inCanvasActive: boolean;
        inSqlite: boolean;
        inS3: boolean;
      };
      const byId = new Map<string, DiffRow>();
      for (const row of res.body.files as DiffRow[]) {
        byId.set(row.fileId, row);
      }
      expect(byId.get("file-a")).toMatchObject({
        inCanvas: true,
        inCanvasActive: true,
        inSqlite: true,
        inS3: false,
      });
      expect(byId.get("file-b")).toMatchObject({
        inCanvas: true,
        inCanvasActive: false,
        inSqlite: true,
      });
      expect(byId.get("file-c")).toMatchObject({
        inCanvas: false,
        inCanvasActive: false,
        inSqlite: true,
      });
    });
  });
});
