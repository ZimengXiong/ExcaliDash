import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../s3", () => ({
  isS3Enabled: vi.fn(),
  getS3Config: vi.fn(),
  uploadBuffer: vi.fn(),
  getPublicUrl: vi.fn(),
  buildS3Key: (
    userId: string,
    drawingId: string,
    fileId: string,
    ext: string,
  ) => `excalidash/${userId}/${drawingId}/${fileId}.${ext}`,
}));

import { internDrawingFiles, decodeDataURL } from "../fileProcessing";
import { isS3Enabled, getS3Config, uploadBuffer, getPublicUrl } from "../s3";

const mockIsS3Enabled = vi.mocked(isS3Enabled);
const mockGetS3Config = vi.mocked(getS3Config);
const mockUploadBuffer = vi.mocked(uploadBuffer);
const mockGetPublicUrl = vi.mocked(getPublicUrl);

/** Tiny valid 1x1 PNG as a base64 data URL */
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg==";
const PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_B64}`;

const makePrisma = () => ({
  drawingFile: {
    upsert: vi.fn().mockResolvedValue({}),
  },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("decodeDataURL", () => {
  it("decodes a valid base64 data URL", () => {
    const result = decodeDataURL(PNG_DATA_URL);
    expect(result).not.toBeNull();
    expect(result!.mimeType).toBe("image/png");
    expect(Buffer.isBuffer(result!.buffer)).toBe(true);
    expect(result!.buffer.length).toBeGreaterThan(0);
  });

  it("returns null for non-data URLs", () => {
    expect(decodeDataURL("https://example.com/image.png")).toBeNull();
    expect(decodeDataURL("/api/files/abc")).toBeNull();
    expect(decodeDataURL("not-a-url")).toBeNull();
  });
});

describe("internDrawingFiles — database-bytes mode (S3 disabled)", () => {
  it("stores inline dataURLs in DrawingFile.data and rewrites to a ref", async () => {
    mockIsS3Enabled.mockReturnValue(false);
    const prisma = makePrisma();

    const files = {
      "file-1": { id: "file-1", mimeType: "image/png", dataURL: PNG_DATA_URL },
    };

    const result = await internDrawingFiles(
      files,
      "user-1",
      "drawing-1",
      prisma as any,
    );

    // dataURL is rewritten to the drawing-scoped ref.
    expect(result["file-1"].dataURL).toBe("/api/files/drawing-1/file-1");
    // No S3 upload happened.
    expect(mockUploadBuffer).not.toHaveBeenCalled();
    // Bytes were persisted with storage="db".
    expect(prisma.drawingFile.upsert).toHaveBeenCalledOnce();
    const call = prisma.drawingFile.upsert.mock.calls[0][0];
    expect(call.where).toEqual({
      drawingId_fileId: { drawingId: "drawing-1", fileId: "file-1" },
    });
    expect(call.create.storage).toBe("db");
    expect(call.create.s3Key).toBeNull();
    expect(Buffer.isBuffer(call.create.data)).toBe(true);
    expect(call.create.sizeBytes).toBeGreaterThan(0);
  });

  it("leaves already-interned refs untouched", async () => {
    mockIsS3Enabled.mockReturnValue(false);
    const prisma = makePrisma();

    const files = {
      "file-1": {
        id: "file-1",
        mimeType: "image/png",
        dataURL: "/api/files/drawing-1/file-1",
      },
    };

    const result = await internDrawingFiles(
      files,
      "user-1",
      "drawing-1",
      prisma as any,
    );

    expect(result["file-1"].dataURL).toBe("/api/files/drawing-1/file-1");
    expect(prisma.drawingFile.upsert).not.toHaveBeenCalled();
  });
});

describe("internDrawingFiles — S3 mode", () => {
  it("uploads base64 files and replaces dataURL with the ref", async () => {
    mockIsS3Enabled.mockReturnValue(true);
    mockGetS3Config.mockReturnValue({
      bucket: "test-bucket",
      region: "us-east-1",
      publicUrl: "https://cdn.example.com",
    });
    mockUploadBuffer.mockResolvedValue(undefined);
    const prisma = makePrisma();

    const files = {
      "file-1": { id: "file-1", mimeType: "image/png", dataURL: PNG_DATA_URL },
    };

    const result = await internDrawingFiles(
      files,
      "user-1",
      "drawing-1",
      prisma as any,
    );

    // With a publicUrl configured the stored ref is the public URL.
    expect(result["file-1"].dataURL).toBe(
      getPublicUrl("excalidash/user-1/drawing-1/file-1.png"),
    );
    expect(mockUploadBuffer).toHaveBeenCalledOnce();
    expect(mockUploadBuffer).toHaveBeenCalledWith(
      "excalidash/user-1/drawing-1/file-1.png",
      expect.any(Buffer),
      "image/png",
    );
    const call = prisma.drawingFile.upsert.mock.calls[0][0];
    expect(call.create).toMatchObject({
      drawingId: "drawing-1",
      fileId: "file-1",
      storage: "s3",
      s3Key: "excalidash/user-1/drawing-1/file-1.png",
      data: null,
      mimeType: "image/png",
    });
  });

  it("skips files with existing S3 URLs (https://)", async () => {
    mockIsS3Enabled.mockReturnValue(true);
    mockGetS3Config.mockReturnValue({
      bucket: "test-bucket",
      region: "us-east-1",
      publicUrl: "https://cdn.example.com",
    });
    const prisma = makePrisma();

    const files = {
      "file-1": {
        id: "file-1",
        mimeType: "image/png",
        dataURL: "https://cdn.example.com/excalidash/user-1/drawing-1/file-1.png",
      },
    };

    const result = await internDrawingFiles(
      files,
      "user-1",
      "drawing-1",
      prisma as any,
    );

    expect(result["file-1"].dataURL).toBe(
      "https://cdn.example.com/excalidash/user-1/drawing-1/file-1.png",
    );
    expect(mockUploadBuffer).not.toHaveBeenCalled();
    expect(prisma.drawingFile.upsert).not.toHaveBeenCalled();
  });

  it("skips files with /api/files/ URLs", async () => {
    mockIsS3Enabled.mockReturnValue(true);
    mockGetS3Config.mockReturnValue({
      bucket: "test-bucket",
      region: "us-east-1",
      publicUrl: "https://cdn.example.com",
    });
    const prisma = makePrisma();

    const files = {
      "file-1": {
        id: "file-1",
        mimeType: "image/png",
        dataURL: "/api/files/drawing-1/file-1",
      },
    };

    const result = await internDrawingFiles(
      files,
      "user-1",
      "drawing-1",
      prisma as any,
    );

    expect(result["file-1"].dataURL).toBe("/api/files/drawing-1/file-1");
    expect(mockUploadBuffer).not.toHaveBeenCalled();
    expect(prisma.drawingFile.upsert).not.toHaveBeenCalled();
  });

  it("uses /api/files/:drawingId/:fileId when no publicUrl configured", async () => {
    mockIsS3Enabled.mockReturnValue(true);
    mockGetS3Config.mockReturnValue({
      bucket: "test-bucket",
      region: "us-east-1",
      // no publicUrl
    });
    mockUploadBuffer.mockResolvedValue(undefined);
    const prisma = makePrisma();

    const files = {
      "file-1": { id: "file-1", mimeType: "image/png", dataURL: PNG_DATA_URL },
    };

    const result = await internDrawingFiles(
      files,
      "user-1",
      "drawing-1",
      prisma as any,
    );

    expect(result["file-1"].dataURL).toBe("/api/files/drawing-1/file-1");
    expect(mockGetPublicUrl).not.toHaveBeenCalled();
  });

  it("rejects file ids containing path traversal characters", async () => {
    mockIsS3Enabled.mockReturnValue(true);
    mockGetS3Config.mockReturnValue({
      bucket: "test-bucket",
      region: "us-east-1",
      publicUrl: "https://cdn.example.com",
    });
    const prisma = makePrisma();

    const files = {
      "../../etc/passwd": {
        id: "../../etc/passwd",
        mimeType: "image/png",
        dataURL: PNG_DATA_URL,
      },
      "good-id": {
        id: "good-id",
        mimeType: "image/png",
        dataURL: PNG_DATA_URL,
      },
    };

    mockUploadBuffer.mockResolvedValue(undefined);
    mockGetPublicUrl.mockImplementation(
      (key: string) => `https://cdn.example.com/${key}`,
    );

    const result = await internDrawingFiles(
      files,
      "user-1",
      "drawing-1",
      prisma as any,
    );

    // Bad id is dropped from the output entirely.
    expect(result["../../etc/passwd"]).toBeUndefined();
    expect(result["good-id"]).toBeDefined();

    // No upload was issued for the bad id.
    expect(mockUploadBuffer).toHaveBeenCalledOnce();
    expect(mockUploadBuffer).toHaveBeenCalledWith(
      "excalidash/user-1/drawing-1/good-id.png",
      expect.any(Buffer),
      "image/png",
    );
    expect(prisma.drawingFile.upsert).toHaveBeenCalledOnce();
  });

  it("handles multiple files, only uploading base64 ones", async () => {
    mockIsS3Enabled.mockReturnValue(true);
    mockGetS3Config.mockReturnValue({
      bucket: "test-bucket",
      region: "us-east-1",
      publicUrl: "https://cdn.example.com",
    });
    mockUploadBuffer.mockResolvedValue(undefined);
    mockGetPublicUrl.mockImplementation(
      (key: string) => `https://cdn.example.com/${key}`,
    );
    const prisma = makePrisma();

    const files = {
      "file-b64": {
        id: "file-b64",
        mimeType: "image/png",
        dataURL: PNG_DATA_URL,
      },
      "file-s3": {
        id: "file-s3",
        mimeType: "image/png",
        dataURL: "https://cdn.example.com/excalidash/user-1/drawing-1/file-s3.png",
      },
      "file-api": {
        id: "file-api",
        mimeType: "image/png",
        dataURL: "/api/files/drawing-1/file-api",
      },
    };

    const result = await internDrawingFiles(
      files,
      "user-1",
      "drawing-1",
      prisma as any,
    );

    // base64 file was uploaded and replaced with its public URL
    expect(result["file-b64"].dataURL).toBe(
      "https://cdn.example.com/excalidash/user-1/drawing-1/file-b64.png",
    );
    // existing URLs left untouched
    expect(result["file-s3"].dataURL).toBe(
      "https://cdn.example.com/excalidash/user-1/drawing-1/file-s3.png",
    );
    expect(result["file-api"].dataURL).toBe("/api/files/drawing-1/file-api");

    // Only one upload call for the base64 file
    expect(mockUploadBuffer).toHaveBeenCalledOnce();
    expect(prisma.drawingFile.upsert).toHaveBeenCalledOnce();
  });
});
