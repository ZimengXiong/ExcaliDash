import { describe, expect, it } from "vitest";
import { partitionUploadFiles } from "../utils/partitionUploadFiles";

describe("partitionUploadFiles", () => {
  it("preserves order and separates a mixed batch in one pass", () => {
    const files = ["a.txt", "one.excalidash", "b.excalidraw", "z.png"].map(
      (name) => new File([], name),
    );
    const result = partitionUploadFiles(files);
    expect(result.supported.map((file) => file.name)).toEqual([
      "one.excalidash",
    ]);
    expect(result.unsupported.map((file) => file.name)).toEqual([
      "a.txt",
      "b.excalidraw",
      "z.png",
    ]);
  });
});
