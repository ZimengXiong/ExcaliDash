import { describe, expect, it, vi } from "vitest";
import { deleteS3KeysInBatches } from "./s3Delete";

describe("deleteS3KeysInBatches", () => {
  it("reports successful and failed S3 object deletes", async () => {
    const deleteObject = vi.fn(async (key: string) => {
      if (key === "bad-key") throw new Error("delete failed");
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await deleteS3KeysInBatches({
      keys: ["good-key", "bad-key", "another-good-key"],
      logPrefix: "[test]",
      deleteObject,
    });

    expect(result).toEqual({
      deleted: 2,
      errors: 1,
      deletedKeys: ["good-key", "another-good-key"],
      failedKeys: ["bad-key"],
    });
    expect(deleteObject).toHaveBeenCalledTimes(3);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });
});
