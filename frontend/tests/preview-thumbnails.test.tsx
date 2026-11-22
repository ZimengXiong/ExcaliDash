import { describe, expect, it } from "vitest";
import {
  buildPreviewFiles,
  computeThumbnailTargets,
} from "../src/utils/previewThumbnails";

const image = (fileId: string, x: number, size: number, extra = {}) => ({
  type: "image",
  fileId,
  x,
  y: 0,
  width: size,
  height: size,
  ...extra,
});

describe("preview thumbnail targets", () => {
  it("sizes each image by its share of the thumbnail, bucketed and clamped", () => {
    const targets = computeThumbnailTargets([
      image("big", 0, 4000),
      image("small", 4000, 100),
    ]);
    // Scene 4100 wide -> 1024 px thumbnail; 4000 units ~ 999 px x2 -> cap 512.
    expect(targets.get("big")).toBe(512);
    // 100 units ~ 25 px x2 = 50 -> bucket 64.
    expect(targets.get("small")).toBe(64);
  });

  it("gives cropped images proportionally more pixels", () => {
    const plain = computeThumbnailTargets([
      image("a", 0, 100),
      image("pad", 3900, 100),
    ]);
    const cropped = computeThumbnailTargets([
      image("a", 0, 100, { crop: { width: 250, naturalWidth: 1000 } }),
      image("pad", 3900, 100),
    ]);
    expect(cropped.get("a")!).toBeGreaterThan(plain.get("a")!);
  });

  it("ignores deleted elements and unreferenced files", async () => {
    const files = {
      used: { id: "used", dataURL: "data:image/png;base64,AAAA" },
      unused: { id: "unused", dataURL: "data:image/png;base64,BBBB" },
      gone: { id: "gone", dataURL: "data:image/png;base64,CCCC" },
    };
    const result = await buildPreviewFiles(
      [image("used", 0, 100), image("gone", 0, 100, { isDeleted: true })],
      files,
    );
    // No DOM in this environment: referenced files pass through unchanged.
    expect(result).toEqual({ used: files.used });
  });
});
