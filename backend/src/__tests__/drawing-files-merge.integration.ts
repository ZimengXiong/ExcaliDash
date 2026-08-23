/**
 * Regression tests for the file save-merge pipeline (backlog B2).
 *
 * Before the fix, PUT /drawings/:id whole-replaced the files JSON with the
 * saving client's snapshot. Two clients editing the same drawing would each
 * clobber the other's images. The fix merges files by fileId (union) and only
 * ever deletes files through the trim/orphans routes.
 *
 * These tests exercise the real Express handlers via supertest.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { StringValue } from "ms";
import { PrismaClient } from "../generated/client";
import { config } from "../config";
import { getTestPrisma, setupTestDb, cleanupTestDb } from "./testUtils";

describe("Drawing file save-merge (B2)", () => {
  const userAgent = "vitest-merge";
  let prisma: PrismaClient;
  let app: any;
  let agent: any;
  let csrfHeaderName: string;
  let csrfToken: string;
  let owner: { id: string; email: string };
  let ownerToken: string;

  const signToken = (userId: string, email: string) => {
    const opts: SignOptions = {
      expiresIn: config.jwtAccessExpiresIn as StringValue,
    };
    return jwt.sign({ userId, email, type: "access" }, config.jwtSecret, opts);
  };

  const fileEntry = (id: string, dataURL = "data:image/png;base64,AAAA") => ({
    id,
    mimeType: "image/png",
    dataURL,
    created: Date.now(),
  });

  const createDrawing = async (
    userId: string,
    files: Record<string, any>,
    version = 1,
  ) =>
    prisma.drawing.create({
      data: {
        name: "Merge Test",
        elements: JSON.stringify([]),
        appState: "{}",
        files: JSON.stringify(files),
        userId,
        version,
      },
    });

  const put = (id: string, body: any) =>
    agent
      .put(`/drawings/${id}`)
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(body);

  const readFiles = async (id: string) => {
    const row = await prisma.drawing.findUniqueOrThrow({ where: { id } });
    return JSON.parse(row.files) as Record<string, any>;
  };

  beforeAll(async () => {
    setupTestDb();
    prisma = getTestPrisma();
    ({ app } = await import("../index"));

    await prisma.systemConfig.upsert({
      where: { id: "default" },
      update: { authEnabled: true, registrationEnabled: false },
      create: { id: "default", authEnabled: true, registrationEnabled: false },
    });

    agent = request.agent(app);
    const csrfRes = await agent.get("/csrf-token").set("User-Agent", userAgent);
    csrfHeaderName = csrfRes.body.header;
    csrfToken = csrfRes.body.token;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanupTestDb(prisma);
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
    owner = ownerRow;
    ownerToken = signToken(owner.id, owner.email);
  });

  it("unions incoming files with existing files instead of whole-replacing", async () => {
    const drawing = await createDrawing(owner.id, {
      "file-a": fileEntry("file-a"),
    });

    // Client saves a payload that only knows about file-b (it never saw file-a).
    const res = await put(drawing.id, {
      elements: [],
      files: { "file-b": fileEntry("file-b") },
    });
    expect(res.status).toBe(200);

    const files = await readFiles(drawing.id);
    // file-a must survive — whole-replace would have deleted it.
    expect(Object.keys(files).sort()).toEqual(["file-a", "file-b"]);
  });

  it("overwrites an existing file entry when the same id carries new content", async () => {
    const drawing = await createDrawing(owner.id, {
      "file-a": fileEntry("file-a", "data:image/png;base64,OLD="),
    });

    const res = await put(drawing.id, {
      elements: [],
      files: { "file-a": fileEntry("file-a", "data:image/png;base64,NEW=") },
    });
    expect(res.status).toBe(200);

    // In database-bytes mode the incoming inline dataURL is interned: the
    // files entry is rewritten to a drawing-scoped ref, and the new bytes
    // land in the DrawingFile row (lazy migration).
    const files = await readFiles(drawing.id);
    expect(files["file-a"].dataURL).toBe(`/api/files/${drawing.id}/file-a`);

    const row = await prisma.drawingFile.findUnique({
      where: {
        drawingId_fileId: { drawingId: drawing.id, fileId: "file-a" },
      },
    });
    expect(row?.storage).toBe("db");
    expect(Buffer.from(row!.data as Uint8Array).equals(Buffer.from("NEW=", "base64"))).toBe(true);
  });

  it("does not let a blank (tombstoned) incoming entry erase existing content", async () => {
    const drawing = await createDrawing(owner.id, {
      "file-a": fileEntry("file-a", "data:image/png;base64,GOOD="),
    });

    const res = await put(drawing.id, {
      elements: [],
      files: { "file-a": { id: "file-a", mimeType: "image/png", dataURL: "" } },
    });
    expect(res.status).toBe(200);

    const files = await readFiles(drawing.id);
    expect(files["file-a"].dataURL).toBe("data:image/png;base64,GOOD=");
  });

  it("snapshots the authoritative in-transaction state and bumps version", async () => {
    const drawing = await createDrawing(
      owner.id,
      { "file-a": fileEntry("file-a") },
      3,
    );

    const res = await put(drawing.id, {
      elements: [],
      files: { "file-b": fileEntry("file-b") },
      version: 3,
    });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(4);

    const snapshots = await prisma.drawingSnapshot.findMany({
      where: { drawingId: drawing.id },
    });
    expect(snapshots).toHaveLength(1);
    // Snapshot captures the pre-update version/state read inside the tx.
    expect(snapshots[0].version).toBe(3);
    const snapFiles = JSON.parse(snapshots[0].files) as Record<string, any>;
    expect(Object.keys(snapFiles)).toEqual(["file-a"]);
  });

  it("returns 409 on a stale version and does not merge", async () => {
    const drawing = await createDrawing(
      owner.id,
      { "file-a": fileEntry("file-a") },
      5,
    );

    const res = await put(drawing.id, {
      elements: [],
      files: { "file-b": fileEntry("file-b") },
      version: 2,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("VERSION_CONFLICT");
    expect(res.body.currentVersion).toBe(5);

    const files = await readFiles(drawing.id);
    expect(Object.keys(files)).toEqual(["file-a"]);
  });
});
