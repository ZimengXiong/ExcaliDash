import { beforeEach, describe, expect, it, vi } from "vitest";

const s3Mocks = vi.hoisted(() => ({
  downloadBuffer: vi.fn(),
}));

vi.mock("../../s3", () => s3Mocks);

import { embedDrawingFilesForExport } from "./exportFiles";

describe("embedDrawingFilesForExport", () => {
  beforeEach(() => vi.clearAllMocks());

  it("re-embeds private S3 files so a backup is self-contained", async () => {
    s3Mocks.downloadBuffer.mockResolvedValue(Buffer.from("s3 image"));

    const result = await embedDrawingFilesForExport(
      {
        image: {
          id: "image",
          mimeType: "image/png",
          dataURL: "/api/files/drawing/image",
          created: 123,
        },
      },
      [{
        fileId: "image",
        mimeType: "image/png",
        storage: "s3",
        s3Key: "drawings/user/drawing/image.png",
        data: null,
      }],
    );

    expect(s3Mocks.downloadBuffer).toHaveBeenCalledWith(
      "drawings/user/drawing/image.png",
    );
    expect(result.image).toEqual({
      id: "image",
      mimeType: "image/png",
      dataURL: `data:image/png;base64,${Buffer.from("s3 image").toString("base64")}`,
      created: 123,
    });
  });

  it("also re-embeds database-backed files", async () => {
    const result = await embedDrawingFilesForExport(
      { image: { id: "image", dataURL: "/api/files/drawing/image" } },
      [{
        fileId: "image",
        mimeType: "image/webp",
        storage: "db",
        s3Key: null,
        data: Buffer.from([1, 2, 3]),
      }],
    );

    expect(result.image).toMatchObject({
      dataURL: "data:image/webp;base64,AQID",
    });
    expect(s3Mocks.downloadBuffer).not.toHaveBeenCalled();
  });

  it("fails instead of producing a silently broken backup when bytes are missing", async () => {
    await expect(embedDrawingFilesForExport(
      { image: { id: "image", dataURL: "/api/files/drawing/image" } },
      [{
        fileId: "image",
        mimeType: "image/png",
        storage: "s3",
        s3Key: null,
        data: null,
      }],
    )).rejects.toThrow("missing its S3 key");
  });

  it("rejects an unresolved reference with no stored file record", async () => {
    await expect(embedDrawingFilesForExport(
      { image: { id: "image", dataURL: "/api/files/drawing/image" } },
      [],
    )).rejects.toThrow("Could not bundle 1 drawing image");
  });
});
