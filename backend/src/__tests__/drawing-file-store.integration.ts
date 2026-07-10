/**
 * Integration tests for the DrawingFile store in database-bytes mode
 * (S3 disabled — the default in the test environment).
 *
 * Covers:
 *   - raw upload (PUT /drawings/:id/files/:fileId) → GET roundtrip
 *   - immutable Cache-Control + ETag, and If-None-Match → 304
 *   - idempotent re-upload (no-op)
 *   - unsupported Content-Type → 415
 *   - edit-access enforcement (non-owner → 404)
 *   - scene PUT with an inline dataURL gets interned to a DrawingFile row
 *   - an "old-shape" scene PUT (inline dataURLs) still succeeds
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { StringValue } from "ms";
import { PrismaClient } from "../generated/client";
import { config } from "../config";
import { getTestPrisma, setupTestDb, cleanupTestDb } from "./testUtils";

/** Tiny valid 1x1 PNG. */
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg==";
const PNG_BYTES = Buffer.from(TINY_PNG_B64, "base64");
const PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_B64}`;

describe("DrawingFile store (database-bytes mode)", () => {
  const userAgent = "vitest-file-store";
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

  const createDrawing = async (userId: string, files: Record<string, any> = {}) =>
    prisma.drawing.create({
      data: {
        name: "Store Test",
        elements: JSON.stringify([]),
        appState: "{}",
        files: JSON.stringify(files),
        userId,
        version: 1,
      },
    });

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
    await prisma.drawingFile.deleteMany({});
    await prisma.user.deleteMany({});

    const passwordHash = await bcrypt.hash("password123", 10);
    owner = await prisma.user.create({
      data: {
        email: "owner@test.local",
        passwordHash,
        name: "Owner",
        role: "USER",
        isActive: true,
      },
      select: { id: true, email: true },
    });
    other = await prisma.user.create({
      data: {
        email: "other@test.local",
        passwordHash,
        name: "Other",
        role: "USER",
        isActive: true,
      },
      select: { id: true, email: true },
    });
    ownerToken = signToken(owner.id, owner.email);
    otherToken = signToken(other.id, other.email);
  });

  const uploadFile = (
    drawingId: string,
    fileId: string,
    token: string,
    body: Buffer,
    contentType = "image/png",
  ) =>
    agent
      .put(`/drawings/${drawingId}/files/${fileId}`)
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", contentType)
      .send(body);

  it("stores raw bytes on PUT and serves them on GET with an immutable ETag", async () => {
    const drawing = await createDrawing(owner.id);

    const put = await uploadFile(drawing.id, "img-1", ownerToken, PNG_BYTES);
    expect(put.status).toBe(200);
    expect(put.body).toEqual({
      url: `/api/files/${drawing.id}/img-1`,
      fileId: "img-1",
    });

    const row = await prisma.drawingFile.findUnique({
      where: { drawingId_fileId: { drawingId: drawing.id, fileId: "img-1" } },
    });
    expect(row?.storage).toBe("db");
    expect(row?.mimeType).toBe("image/png");
    expect(row?.sizeBytes).toBe(PNG_BYTES.length);
    expect(Buffer.from(row!.data as Uint8Array).equals(PNG_BYTES)).toBe(true);

    const get = await agent
      .get(`/files/${drawing.id}/img-1`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(get.status).toBe(200);
    expect(get.headers["content-type"]).toContain("image/png");
    expect(get.headers["cache-control"]).toBe(
      "private, max-age=31536000, immutable",
    );
    expect(get.headers["etag"]).toBe('"img-1"');
    expect(Buffer.from(get.body).equals(PNG_BYTES)).toBe(true);
  });

  it("returns 304 when If-None-Match matches the ETag", async () => {
    const drawing = await createDrawing(owner.id);
    await uploadFile(drawing.id, "img-1", ownerToken, PNG_BYTES);

    const res = await agent
      .get(`/files/${drawing.id}/img-1`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("If-None-Match", '"img-1"');

    expect(res.status).toBe(304);
  });

  it("is idempotent: re-uploading the same file is a 200 no-op", async () => {
    const drawing = await createDrawing(owner.id);
    await uploadFile(drawing.id, "img-1", ownerToken, PNG_BYTES);

    const second = await uploadFile(drawing.id, "img-1", ownerToken, PNG_BYTES);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({
      url: `/api/files/${drawing.id}/img-1`,
      fileId: "img-1",
    });

    const count = await prisma.drawingFile.count({
      where: { drawingId: drawing.id },
    });
    expect(count).toBe(1);
  });

  it("rejects an unsupported Content-Type with 415", async () => {
    const drawing = await createDrawing(owner.id);
    const res = await uploadFile(
      drawing.id,
      "img-1",
      ownerToken,
      Buffer.from([1, 2, 3]),
      "application/pdf",
    );
    expect(res.status).toBe(415);
  });

  it("returns 404 when a non-editor tries to upload", async () => {
    const drawing = await createDrawing(owner.id);
    const res = await uploadFile(drawing.id, "img-1", otherToken, PNG_BYTES);
    expect(res.status).toBe(404);

    const count = await prisma.drawingFile.count({
      where: { drawingId: drawing.id },
    });
    expect(count).toBe(0);
  });

  it("interns an inline dataURL from a scene PUT into a DrawingFile row", async () => {
    const drawing = await createDrawing(owner.id);

    const res = await agent
      .put(`/drawings/${drawing.id}`)
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        elements: [],
        files: {
          "img-x": {
            id: "img-x",
            mimeType: "image/png",
            dataURL: PNG_DATA_URL,
            created: Date.now(),
          },
        },
      });
    expect(res.status).toBe(200);

    // The stored files JSON now carries a ref, not the inline dataURL.
    const stored = await prisma.drawing.findUniqueOrThrow({
      where: { id: drawing.id },
    });
    const files = JSON.parse(stored.files) as Record<string, any>;
    expect(files["img-x"].dataURL).toBe(`/api/files/${drawing.id}/img-x`);

    // The bytes were interned into a storage="db" DrawingFile row.
    const row = await prisma.drawingFile.findUnique({
      where: { drawingId_fileId: { drawingId: drawing.id, fileId: "img-x" } },
    });
    expect(row?.storage).toBe("db");
    expect(Buffer.from(row!.data as Uint8Array).equals(PNG_BYTES)).toBe(true);

    // And it is served back correctly.
    const get = await agent
      .get(`/files/${drawing.id}/img-x`)
      .set("User-Agent", userAgent)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(get.status).toBe(200);
    expect(Buffer.from(get.body).equals(PNG_BYTES)).toBe(true);
  });

  it("accepts an old-shape scene PUT with only non-image fields", async () => {
    const drawing = await createDrawing(owner.id);

    const res = await agent
      .put(`/drawings/${drawing.id}`)
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ elements: [], appState: { viewBackgroundColor: "#ffffff" } });

    expect(res.status).toBe(200);
  });
});
