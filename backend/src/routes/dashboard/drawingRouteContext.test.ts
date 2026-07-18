import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDrawingRouteContext } from "./drawingRouteContext";

const s3Mocks = vi.hoisted(() => ({
  buildS3Key: vi.fn(),
  copyS3Object: vi.fn(),
  deleteS3Object: vi.fn(),
  drawingS3Prefix: vi.fn(),
  getPublicUrl: vi.fn(),
  getS3Config: vi.fn(),
  isS3Enabled: vi.fn(),
  listS3Objects: vi.fn(),
}));

vi.mock("../../s3", () => s3Mocks);

describe("drawing route context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    s3Mocks.isS3Enabled.mockReturnValue(true);
    s3Mocks.getS3Config.mockReturnValue({});
    s3Mocks.buildS3Key.mockReturnValue(
      "excalidash/user-1/target-drawing/file-1.png",
    );
  });

  it("fails duplicate S3 cloning when an object copy fails", async () => {
    const prisma = {
      drawingFile: {
        findMany: vi.fn().mockResolvedValue([
          {
            drawingId: "source-drawing",
            fileId: "file-1",
            storage: "s3",
            s3Key: "excalidash/user-1/source-drawing/file-1.png",
            data: null,
            mimeType: "image/png",
            sizeBytes: 0,
          },
        ]),
        upsert: vi.fn(),
      },
    };
    s3Mocks.copyS3Object.mockRejectedValue(new Error("copy failed"));

    const context = createDrawingRouteContext({
      prisma: prisma as any,
    } as any);

    await expect(
      context.cloneS3FileReferences(
        "source-drawing",
        "target-drawing",
        "user-1",
        {
          "file-1": {
            dataURL: "/api/files/source-drawing/file-1",
          },
        },
      ),
    ).rejects.toThrow("copy failed");
    expect(prisma.drawingFile.upsert).not.toHaveBeenCalled();
  });

  it("limits S3 clone copies to batches of eight and upserts after each copy", async () => {
    let copiesInFlight = 0;
    let peakCopies = 0;
    const records = Array.from({ length: 9 }, (_, index) => ({
      drawingId: "source-drawing", fileId: `file-${index}`, storage: "s3",
      s3Key: `source/file-${index}.png`, data: null, mimeType: "image/png", sizeBytes: 1,
    }));
    const prisma = { drawingFile: { findMany: vi.fn().mockResolvedValue(records), upsert: vi.fn() } };
    s3Mocks.copyS3Object.mockImplementation(async () => {
      copiesInFlight += 1;
      peakCopies = Math.max(peakCopies, copiesInFlight);
      await Promise.resolve();
      copiesInFlight -= 1;
    });
    const context = createDrawingRouteContext({ prisma: prisma as any } as any);

    await context.cloneS3FileReferences("source-drawing", "target-drawing", "user-1", {});

    expect(peakCopies).toBe(8);
    expect(prisma.drawingFile.upsert).toHaveBeenCalledTimes(9);
  });

  it("limits S3 cleanup deletes to batches of eight while continuing after errors", async () => {
    let deletesInFlight = 0;
    let peakDeletes = 0;
    s3Mocks.drawingS3Prefix.mockReturnValue("excalidash/user-1/drawing-1/");
    s3Mocks.listS3Objects.mockResolvedValue(
      Array.from({ length: 9 }, (_, index) => ({ key: `object-${index}` })),
    );
    s3Mocks.deleteS3Object.mockImplementation(async (key: string) => {
      deletesInFlight += 1;
      peakDeletes = Math.max(peakDeletes, deletesInFlight);
      await Promise.resolve();
      deletesInFlight -= 1;
      if (key === "object-0") throw new Error("already gone");
    });
    const prisma = {
      drawingFile: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const context = createDrawingRouteContext({ prisma: prisma as any } as any);

    await expect(context.cleanupS3FilesForDrawing("drawing-1", "user-1")).rejects.toThrow(
      "One or more S3 object deletions failed",
    );

    expect(peakDeletes).toBe(8);
    expect(s3Mocks.deleteS3Object).toHaveBeenCalledTimes(9);
    expect(prisma.drawingFile.deleteMany).not.toHaveBeenCalled();
  });
});
