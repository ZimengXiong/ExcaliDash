/**
 * Integration tests for the DrawingFile store in database-bytes mode
 * (S3 disabled — the default in the test environment).
 *
 * Covers:
 *   - raw upload (PUT /drawings/:id/files/:fileId) → GET roundtrip
 *   - private Cache-Control + ETag, and If-None-Match → 304
 *   - idempotent re-upload (no-op)
 *   - unsupported Content-Type → 415
 *   - edit-access enforcement (non-owner → 404)
 *   - scene PUT with an inline dataURL gets interned to a DrawingFile row
 *   - an "old-shape" scene PUT (inline dataURLs) still succeeds
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import JSZip from "jszip";
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

  const createDrawing = async (
    userId: string,
    files: Record<string, any> = {},
  ) =>
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

  it("stores raw bytes on PUT and serves them on GET with an ETag that requires revalidation", async () => {
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
    expect(get.headers["cache-control"]).toBe("private, no-cache");
    expect(get.headers["etag"]).toBe('"img-1"');
    expect(Buffer.from(get.body).equals(PNG_BYTES)).toBe(true);
  });

  it("returns 304 when If-None-Match matches the ETag", async () => {
    const drawing = await createDrawing(owner.id);
    await uploadFile(drawing.id, "img-1", ownerToken, PNG_BYTES);

    const revalidate = () =>
      agent
        .get(`/files/${drawing.id}/img-1`)
        .set("User-Agent", userAgent)
        .set("Authorization", `Bearer ${ownerToken}`)
        .set("If-None-Match", '"older", W/"img-1"');

    const res = await revalidate();
    expect(res.status).toBe(304);
    expect(res.headers.etag).toBe('"img-1"');
    const missing = await agent
      .get(`/files/${drawing.id}/missing`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("If-None-Match", "*");
    expect(missing.status).toBe(404);
    const denied = await agent
      .get(`/files/${drawing.id}/img-1`)
      .set("Authorization", `Bearer ${otherToken}`)
      .set("If-None-Match", "*");
    expect(denied.status).toBe(404);

    await prisma.drawingFile.update({
      where: { drawingId_fileId: { drawingId: drawing.id, fileId: "img-1" } },
      data: { data: null },
    });
    expect((await revalidate()).status).toBe(404);
  });

  it("keeps large previews out of the dashboard and revalidates them independently", async () => {
    const preview = `<svg><!--${"x".repeat(512 * 1024)}--></svg>`;
    await prisma.drawing.createMany({
      data: Array.from({ length: 8 }, (_, i) => ({
        userId: owner.id,
        name: `Drawing ${i}`,
        elements: "[]",
        appState: "{}",
        preview,
      })),
    });
    const list = await agent
      .get("/api/drawings")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(list.status).toBe(200);
    expect(list.body.totalCount).toBe(8);
    expect(list.body.drawings).toHaveLength(8);
    expect(Buffer.byteLength(list.text)).toBeLessThan(4096);
    const { id } = list.body.drawings[0];
    const url = `/api/drawings/${id}/preview`;
    const get = () =>
      agent.get(url).set("Authorization", `Bearer ${ownerToken}`);
    const initial = await get();
    expect(initial.body.preview).toBe(preview);
    const tag = initial.headers.etag;
    expect((await get().set("If-None-Match", tag)).status).toBe(304);
    await prisma.drawing.update({
      where: { id },
      data: { preview: "<svg/>" },
      select: { id: true },
    });
    const updated = await get().set("If-None-Match", tag);
    expect(updated.status).toBe(200);
    expect(updated.body.preview).toBe("<svg/>");
    expect(updated.headers.etag).not.toBe(tag);
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

  it("does not overwrite uploaded image bytes when a stale scene save conflicts", async () => {
    const drawing = await createDrawing(owner.id);
    await prisma.drawing.update({
      where: { id: drawing.id },
      data: { version: 2 },
    });
    await uploadFile(drawing.id, "img-existing", ownerToken, PNG_BYTES);
    const res = await agent
      .put(`/drawings/${drawing.id}`)
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        version: 1,
        elements: [],
        files: {
          "img-existing": {
            id: "img-existing",
            mimeType: "image/png",
            dataURL: "data:image/png;base64,AAAA",
          },
        },
      });
    expect(res.status).toBe(409);
    const image = await agent
      .get(`/files/${drawing.id}/img-existing`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(image.status).toBe(200);
    expect(Buffer.from(image.body).equals(PNG_BYTES)).toBe(true);
  });

  it("keeps immutable uploaded image bytes when an old scene resends the file id", async () => {
    const drawing = await createDrawing(owner.id);
    await uploadFile(drawing.id, "img-existing", ownerToken, PNG_BYTES);
    const res = await agent
      .put(`/drawings/${drawing.id}`)
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        elements: [],
        files: {
          "img-existing": {
            id: "img-existing",
            mimeType: "image/png",
            dataURL: "data:image/png;base64,AAAA",
          },
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.files["img-existing"].dataURL).toBe(
      `/api/files/${drawing.id}/img-existing`,
    );
    const image = await agent
      .get(`/files/${drawing.id}/img-existing`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(image.status).toBe(200);
    expect(Buffer.from(image.body).equals(PNG_BYTES)).toBe(true);
  });

  it("rebases copied preview images so deleting the source keeps the copy usable", async () => {
    const drawing = await createDrawing(owner.id);
    await uploadFile(drawing.id, "img-copy", ownerToken, PNG_BYTES);
    const sourceUrl = `/api/files/${drawing.id}/img-copy`;
    await prisma.drawing.update({
      where: { id: drawing.id },
      data: {
        files: JSON.stringify({
          "img-copy": {
            id: "img-copy",
            mimeType: "image/png",
            dataURL: sourceUrl,
          },
        }),
        preview: `<svg xmlns="http://www.w3.org/2000/svg"><image href="${sourceUrl}" width="40" height="40"/></svg>`,
      },
    });
    const copy = await agent
      .post(`/drawings/${drawing.id}/duplicate`)
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(copy.status).toBe(200);
    const copyUrl = `/api/files/${copy.body.id}/img-copy`;
    expect(copy.body.files["img-copy"].dataURL).toBe(copyUrl);
    expect(copy.body.preview).toContain(`href="${copyUrl}"`);
    expect(copy.body.preview).not.toContain(sourceUrl);

    const deleted = await agent
      .delete(`/drawings/${drawing.id}`)
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(deleted.status).toBe(200);
    const image = await agent
      .get(`/files/${copy.body.id}/img-copy`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(image.status).toBe(200);
    expect(Buffer.from(image.body).equals(PNG_BYTES)).toBe(true);
  });

  it("keeps Excalidraw image symbols and crops while stripping unsafe references", async () => {
    const drawing = await createDrawing(owner.id);
    const preview = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <defs><symbol id="image-test"><image href="${PNG_DATA_URL}" width="100%" height="100%"/></symbol></defs>
      <mask id="crop"><rect width="50" height="50" fill="#fff"/></mask>
      <g mask="url(#crop)"><use href="#image-test" width="100" height="100"/></g>
      <use href="https://untrusted.example/image.svg#remote"/>
      <use href="javascript:alert(1)"/>
      <image href="javascript:alert(1)"/>
      <g mask="url(https://untrusted.example/mask.svg#mask)"/>
      <script>alert(1)</script>
    </svg>`;
    const saved = await agent
      .put(`/drawings/${drawing.id}`)
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ preview });
    expect(saved.status).toBe(200);
    const result = await agent
      .get(`/drawings/${drawing.id}/preview`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(result.status).toBe(200);
    expect(result.body.preview).toContain('<symbol id="image-test">');
    expect(result.body.preview).toContain('<use href="#image-test"');
    expect(result.body.preview).toContain('mask="url(#crop)"');
    expect(result.body.preview).toContain(PNG_DATA_URL);
    expect(result.body.preview).not.toMatch(/untrusted|javascript:|<script/);
  });

  it("requires authentication and exports only the account owner's image references", async () => {
    const external = {
      id: "external",
      mimeType: "image/png",
      dataURL: "https://external.example/imported.png",
    };
    const owned = await createDrawing(owner.id, { external });
    // A broken managed image in another account must neither leak nor block us.
    await createDrawing(other.id, {
      missing: {
        id: "missing",
        mimeType: "image/png",
        dataURL: "/api/files/other-drawing/missing",
      },
    });
    expect((await agent.get("/export/excalidash")).status).toBe(401);
    const exported = await agent
      .get("/export/excalidash")
      .set("Authorization", `Bearer ${ownerToken}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
        res.on("error", callback);
      });
    expect(exported.status).toBe(200);
    const zip = await JSZip.loadAsync(exported.body);
    const manifest = JSON.parse(
      await zip.file("excalidash.manifest.json")!.async("string"),
    );
    expect(manifest.drawings).toHaveLength(1);
    expect(manifest.drawings[0].id).toBe(owned.id);
    const drawing = JSON.parse(
      await zip.file(manifest.drawings[0].filePath)!.async("string"),
    );
    expect(drawing.files).toEqual({ external });

    const unauthenticatedImport = await agent
      .post("/import/excalidash")
      .set("User-Agent", userAgent)
      .set(csrfHeaderName, csrfToken)
      .attach("archive", exported.body, "backup.excalidash");
    expect(unauthenticatedImport.status).toBe(401);
  });
});
