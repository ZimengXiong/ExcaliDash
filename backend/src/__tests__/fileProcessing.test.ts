import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../s3", () => ({
  isS3Enabled: vi.fn(),
  getS3Config: vi.fn(),
  uploadBuffer: vi.fn(),
  getPublicUrl: vi.fn(),
}));

import { processFilesForS3, decodeDataURL } from "../fileProcessing";
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
  s3File: {
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

describe("processFilesForS3", () => {
  it("returns files unchanged when S3 is not enabled", async () => {
    mockIsS3Enabled.mockReturnValue(false);
    const prisma = makePrisma();

    const files = {
      "file-1": { id: "file-1", mimeType: "image/png", dataURL: PNG_DATA_URL },
    };

    const result = await processFilesForS3(files, "user-1", "drawing-1", prisma as any);

    expect(result).toBe(files); // exact same reference
    expect(mockUploadBuffer).not.toHaveBeenCalled();
    expect(prisma.s3File.upsert).not.toHaveBeenCalled();
  });

  it("uploads base64 files and replaces dataURL with S3 public URL", async () => {
    mockIsS3Enabled.mockReturnValue(true);
    mockGetS3Config.mockReturnValue({
      bucket: "test-bucket",
      region: "us-east-1",
      publicUrl: "https://cdn.example.com",
    });
    mockUploadBuffer.mockResolvedValue(undefined);
    mockGetPublicUrl.mockReturnValue(
      "https://cdn.example.com/excalidash/user-1/drawing-1/file-1.png",
    );
    const prisma = makePrisma();

    const files = {
      "file-1": { id: "file-1", mimeType: "image/png", dataURL: PNG_DATA_URL },
    };

    const result = await processFilesForS3(files, "user-1", "drawing-1", prisma as any);

    expect(result["file-1"].dataURL).toBe(
      "https://cdn.example.com/excalidash/user-1/drawing-1/file-1.png",
    );
    expect(mockUploadBuffer).toHaveBeenCalledOnce();
    expect(mockUploadBuffer).toHaveBeenCalledWith(
      "excalidash/user-1/drawing-1/file-1.png",
      expect.any(Buffer),
      "image/png",
    );
    expect(prisma.s3File.upsert).toHaveBeenCalledWith({
      where: { id: "file-1" },
      create: {
        id: "file-1",
        userId: "user-1",
        s3Key: "excalidash/user-1/drawing-1/file-1.png",
        mimeType: "image/png",
      },
      update: {
        s3Key: "excalidash/user-1/drawing-1/file-1.png",
        mimeType: "image/png",
      },
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

    const result = await processFilesForS3(files, "user-1", "drawing-1", prisma as any);

    expect(result["file-1"].dataURL).toBe(
      "https://cdn.example.com/excalidash/user-1/drawing-1/file-1.png",
    );
    expect(mockUploadBuffer).not.toHaveBeenCalled();
    expect(prisma.s3File.upsert).not.toHaveBeenCalled();
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
        dataURL: "/api/files/file-1",
      },
    };

    const result = await processFilesForS3(files, "user-1", "drawing-1", prisma as any);

    expect(result["file-1"].dataURL).toBe("/api/files/file-1");
    expect(mockUploadBuffer).not.toHaveBeenCalled();
    expect(prisma.s3File.upsert).not.toHaveBeenCalled();
  });

  it("uses /api/files/:fileId when no publicUrl configured", async () => {
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

    const result = await processFilesForS3(files, "user-1", "drawing-1", prisma as any);

    expect(result["file-1"].dataURL).toBe("/api/files/file-1");
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

    const result = await processFilesForS3(
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
    expect(prisma.s3File.upsert).toHaveBeenCalledOnce();
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
        dataURL: "/api/files/file-api",
      },
    };

    const result = await processFilesForS3(files, "user-1", "drawing-1", prisma as any);

    // base64 file was uploaded and replaced
    expect(result["file-b64"].dataURL).toBe(
      "https://cdn.example.com/excalidash/user-1/drawing-1/file-b64.png",
    );
    // existing URLs left untouched
    expect(result["file-s3"].dataURL).toBe(
      "https://cdn.example.com/excalidash/user-1/drawing-1/file-s3.png",
    );
    expect(result["file-api"].dataURL).toBe("/api/files/file-api");

    // Only one upload call for the base64 file
    expect(mockUploadBuffer).toHaveBeenCalledOnce();
    expect(prisma.s3File.upsert).toHaveBeenCalledOnce();
  });
});
