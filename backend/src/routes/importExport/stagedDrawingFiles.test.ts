import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStagedDrawingFiles } from "./stagedDrawingFiles";

const s3 = vi.hoisted(() => ({ deleteS3Object: vi.fn() }));
vi.mock("../../s3", () => s3);

describe("staged drawing file cleanup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("removes only journaled rows after their S3 objects are deleted", async () => {
    s3.deleteS3Object.mockResolvedValue(undefined);
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const journal = createStagedDrawingFiles();
    journal.recordNew("drawing-1", "file-1", "key-1");
    journal.recordNew("drawing-2", "file-2", null);

    await journal.cleanup({ drawingFile: { deleteMany } } as any);

    expect(s3.deleteS3Object).toHaveBeenCalledWith("key-1");
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { drawingId: "drawing-1", fileId: "file-1" },
          { drawingId: "drawing-2", fileId: "file-2" },
        ],
      },
    });
  });

  it("keeps row metadata when an S3 deletion fails", async () => {
    s3.deleteS3Object.mockRejectedValue(new Error("storage unavailable"));
    const deleteMany = vi.fn();
    const journal = createStagedDrawingFiles();
    journal.recordNew("drawing-1", "file-1", "key-1");

    await expect(
      journal.cleanup({ drawingFile: { deleteMany } } as any),
    ).rejects.toThrow("Failed to clean up staged S3 objects");
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
