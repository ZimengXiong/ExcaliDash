import { beforeEach, describe, expect, it, vi } from "vitest";
import { embedDrawingFilesForExport } from "../routes/importExport/exportFiles";
import { downloadBuffer } from "../s3";

vi.mock("../s3", () => ({ downloadBuffer: vi.fn() }));

const externalUrl = "https://external.example/imported.png";
const files = (dataURL = externalUrl) => ({
  image: { id: "image", mimeType: "image/png", created: 123, dataURL },
});
const record = {
  fileId: "image",
  mimeType: "image/png",
  storage: "db",
  s3Key: null,
  data: Buffer.from("managed image bytes"),
};
const inlineUrl = `data:image/png;base64,${record.data.toString("base64")}`;

describe("account backup image storage integration", () => {
  beforeEach(() => {
    vi.mocked(downloadBuffer).mockReset();
  });

  it.each([externalUrl, "http://legacy.example/image.png"])(
    "preserves unmanaged %s without accessing storage or the network",
    async (url) => {
      const source = files(url);
      expect(await embedDrawingFilesForExport(source, [])).toEqual(source);
      expect(downloadBuffer).not.toHaveBeenCalled();
    },
  );

  it.each([
    "/api/files/old-drawing/image",
    "https://app.example/api/files/old-drawing/image",
    "https://",
    "https://example.com/" + "x".repeat(2048),
    "//external.example/image.png",
    "file:///tmp/image.png",
    "javascript:alert(1)",
    "blob:https://app.example/image",
  ])("rejects unresolved or unsupported reference %s", async (url) => {
    await expect(embedDrawingFilesForExport(files(url), [])).rejects.toThrow(
      "Could not bundle 1 drawing image(s): image",
    );
    expect(downloadBuffer).not.toHaveBeenCalled();
  });

  it("retains legacy inline bytes and metadata unchanged", async () => {
    const source = files(inlineUrl);
    expect(await embedDrawingFilesForExport(source, [])).toEqual(source);
    expect(downloadBuffer).not.toHaveBeenCalled();
  });

  it.each([externalUrl, "/api/files/drawing/image", inlineUrl])(
    "uses authoritative managed database bytes even when the scene contains %s",
    async (url) => {
      const source = files(url);
      expect(await embedDrawingFilesForExport(source, [record])).toEqual(
        files(inlineUrl),
      );
      expect(source.image.dataURL).toBe(url);
    },
  );

  it.each(["owner/drawing/image.png", "owner/drawing/generation/image.png"])(
    "bundles managed S3 bytes at %s instead of retaining the public CDN reference",
    async (s3Key) => {
      vi.mocked(downloadBuffer).mockResolvedValue(record.data);
      expect(
        await embedDrawingFilesForExport(files(), [
          {
            ...record,
            storage: "s3",
            s3Key,
            data: null,
          },
        ]),
      ).toEqual(files(inlineUrl));
      expect(downloadBuffer).toHaveBeenCalledExactlyOnceWith(s3Key);
    },
  );

  it.each([externalUrl, inlineUrl])(
    "does not mask missing managed database bytes with %s",
    async (url) => {
      await expect(
        embedDrawingFilesForExport(files(url), [{ ...record, data: null }]),
      ).rejects.toThrow("Stored drawing file is missing database bytes: image");
    },
  );

  it("fails on a missing managed S3 key", async () => {
    await expect(
      embedDrawingFilesForExport(files(), [{ ...record, storage: "s3" }]),
    ).rejects.toThrow("Stored drawing file is missing its S3 key: image");
    expect(downloadBuffer).not.toHaveBeenCalled();
  });

  it.each(["NoSuchKey", "AccessDenied", "storage unavailable"])(
    "propagates managed S3 failure %s rather than preserving the CDN URL",
    async (message) => {
      vi.mocked(downloadBuffer).mockRejectedValue(new Error(message));
      const source = files();
      await expect(
        embedDrawingFilesForExport(source, [
          { ...record, storage: "s3", s3Key: "managed/image.png", data: null },
        ]),
      ).rejects.toThrow(message);
      expect(source.image.dataURL).toBe(externalUrl);
    },
  );

  it("rejects unsupported managed storage", async () => {
    await expect(
      embedDrawingFilesForExport(files(), [{ ...record, storage: "unknown" }]),
    ).rejects.toThrow("Unsupported drawing file storage: unknown");
  });
  it("does not conceal corrupt tracked bytes in recovery mode", async () => {
    const reportMissing = vi.fn();
    await expect(
      embedDrawingFilesForExport(
        files(),
        [{ ...record, data: Buffer.alloc(0) }],
        reportMissing,
      ),
    ).rejects.toThrow("missing database bytes");
    vi.mocked(downloadBuffer).mockResolvedValue(Buffer.alloc(0));
    await expect(
      embedDrawingFilesForExport(
        files(),
        [{ ...record, storage: "s3", s3Key: "managed/image.png", data: null }],
        reportMissing,
      ),
    ).rejects.toThrow("has no bytes");
    expect(reportMissing).not.toHaveBeenCalled();
  });
});
