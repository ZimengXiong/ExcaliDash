import { beforeEach, describe, expect, it, vi } from "vitest";

const apiPost = vi.fn();

vi.mock("../api", () => ({
  api: {
    post: (...args: unknown[]) => apiPost(...args),
  },
}));

import {
  EXCALIDASH_REQUIRED_MESSAGE,
  importExcalidashFiles,
  isExcalidashFile,
} from "./importUtils";

describe("ExcaliDash imports", () => {
  beforeEach(() => {
    apiPost.mockReset();
  });

  it("recognizes only the .excalidash extension", () => {
    expect(isExcalidashFile({ name: "backup.excalidash" })).toBe(true);
    expect(isExcalidashFile({ name: "BACKUP.EXCALIDASH" })).toBe(true);
    expect(isExcalidashFile({ name: "backup.excalidash.zip" })).toBe(false);
    expect(isExcalidashFile({ name: "drawing.excalidraw" })).toBe(false);
    expect(isExcalidashFile({ name: "drawing.json" })).toBe(false);
  });

  it("uploads a .excalidash archive to the canonical endpoint", async () => {
    apiPost.mockResolvedValue({ data: { success: true } });
    const file = new File(["archive"], "backup.excalidash");
    const onProgress = vi.fn();

    const result = await importExcalidashFiles(
      [file],
      undefined,
      onProgress,
    );

    expect(result).toEqual({ success: 1, failed: 0, errors: [] });
    expect(apiPost).toHaveBeenCalledWith(
      "/import/excalidash",
      expect.any(FormData),
      expect.objectContaining({
        headers: { "Content-Type": "multipart/form-data" },
      }),
    );
    expect(onProgress).toHaveBeenLastCalledWith(0, "success", 100);
  });

  it("rejects legacy files without calling the API", async () => {
    const file = new File(["{}"], "drawing.excalidraw");
    const onProgress = vi.fn();

    const result = await importExcalidashFiles(
      [file],
      undefined,
      onProgress,
    );

    expect(result).toEqual({
      success: 0,
      failed: 1,
      errors: [`drawing.excalidraw: ${EXCALIDASH_REQUIRED_MESSAGE}`],
    });
    expect(apiPost).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith(
      0,
      "error",
      0,
      EXCALIDASH_REQUIRED_MESSAGE,
    );
  });
});
