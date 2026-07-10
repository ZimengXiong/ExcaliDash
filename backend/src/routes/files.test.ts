import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerFileRoutes } from "./files";

const s3Mocks = vi.hoisted(() => ({
  isS3Enabled: vi.fn(),
  generatePresignedDownloadUrl: vi.fn(),
  uploadBuffer: vi.fn(),
  buildS3Key: vi.fn(),
}));

vi.mock("../s3", () => s3Mocks);

describe("file routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    s3Mocks.isS3Enabled.mockReturnValue(true);
    s3Mocks.generatePresignedDownloadUrl.mockResolvedValue(
      "https://signed.example/file",
    );
  });

  it("allows private S3 redirects for users with collection share access", async () => {
    const prisma = {
      drawing: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            userId: "owner-user",
          })
          .mockResolvedValueOnce({
            collectionId: "shared-collection",
            userId: "owner-user",
          }),
      },
      drawingPermission: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      collection: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      collectionShare: {
        findFirst: vi.fn().mockResolvedValue({ role: "view" }),
      },
      drawingLinkShare: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      drawingFile: {
        findUnique: vi.fn().mockResolvedValue({
          storage: "s3",
          s3Key: "excalidash/owner-user/drawing-1/file-1.png",
          mimeType: "image/png",
          data: null,
        }),
      },
    };
    const app = express();
    registerFileRoutes(app, {
      prisma: prisma as any,
      requireAuth: (_req, _res, next) => next(),
      optionalAuth: (req, _res, next) => {
        req.user = {
          id: "viewer-user",
          email: "viewer@test.local",
          name: "Viewer",
          role: "USER",
        };
        next();
      },
      asyncHandler: (fn) => (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
      },
    });

    const response = await request(app).get("/files/drawing-1/file-1");

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe("https://signed.example/file");
    expect(prisma.collectionShare.findFirst).toHaveBeenCalledWith({
      where: {
        collectionId: "shared-collection",
        granteeUserId: "viewer-user",
      },
      select: { role: true },
    });
  });

  it("uploads raw bytes to S3 and records a storage='s3' DrawingFile row", async () => {
    s3Mocks.isS3Enabled.mockReturnValue(true);
    s3Mocks.buildS3Key.mockReturnValue(
      "excalidash/owner-user/drawing-1/file-1.png",
    );
    s3Mocks.uploadBuffer.mockResolvedValue(undefined);

    const upsert = vi.fn().mockResolvedValue({});
    const prisma = {
      drawing: {
        findUnique: vi.fn().mockResolvedValue({ userId: "owner-user" }),
      },
      drawingFile: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert,
      },
    };
    const app = express();
    registerFileRoutes(app, {
      prisma: prisma as any,
      requireAuth: (req, _res, next) => {
        req.user = {
          id: "owner-user",
          email: "owner@test.local",
          name: "Owner",
          role: "USER",
        };
        next();
      },
      optionalAuth: (_req, _res, next) => next(),
      asyncHandler: (fn) => (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
      },
    });

    const response = await request(app)
      .put("/drawings/drawing-1/files/file-1")
      .set("Content-Type", "image/png")
      .send(Buffer.from([1, 2, 3, 4]));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      url: "/api/files/drawing-1/file-1",
      fileId: "file-1",
    });
    expect(s3Mocks.uploadBuffer).toHaveBeenCalledWith(
      "excalidash/owner-user/drawing-1/file-1.png",
      expect.any(Buffer),
      "image/png",
    );
    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert.mock.calls[0][0].create).toMatchObject({
      drawingId: "drawing-1",
      fileId: "file-1",
      storage: "s3",
      s3Key: "excalidash/owner-user/drawing-1/file-1.png",
      data: null,
      mimeType: "image/png",
    });
  });

  it("rejects an unsupported Content-Type with 415", async () => {
    s3Mocks.isS3Enabled.mockReturnValue(false);
    const prisma = {
      drawing: {
        findUnique: vi.fn().mockResolvedValue({ userId: "owner-user" }),
      },
      drawingFile: { findUnique: vi.fn(), upsert: vi.fn() },
    };
    const app = express();
    registerFileRoutes(app, {
      prisma: prisma as any,
      requireAuth: (req, _res, next) => {
        req.user = {
          id: "owner-user",
          email: "owner@test.local",
          name: "Owner",
          role: "USER",
        };
        next();
      },
      optionalAuth: (_req, _res, next) => next(),
      asyncHandler: (fn) => (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
      },
    });

    const response = await request(app)
      .put("/drawings/drawing-1/files/file-1")
      .set("Content-Type", "application/pdf")
      .send(Buffer.from([1, 2, 3, 4]));

    expect(response.status).toBe(415);
    expect(prisma.drawingFile.upsert).not.toHaveBeenCalled();
  });
});
