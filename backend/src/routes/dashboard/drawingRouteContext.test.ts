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
});
