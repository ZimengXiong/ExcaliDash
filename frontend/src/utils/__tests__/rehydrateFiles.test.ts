import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  filesNeedRehydration,
  rehydrateFilesFromUrls,
} from "../rehydrateFiles";

const blobFor = (mime: string, bytes = [1, 2, 3]) =>
  new Blob([new Uint8Array(bytes)], mime ? { type: mime } : undefined);

describe("filesNeedRehydration", () => {
  it("returns false for empty / non-object input", () => {
    expect(filesNeedRehydration(null)).toBe(false);
    expect(filesNeedRehydration(undefined)).toBe(false);
    expect(filesNeedRehydration({})).toBe(false);
  });

  it("returns false when every dataURL is already inline", () => {
    expect(
      filesNeedRehydration({
        a: { dataURL: "data:image/png;base64,AAAA" },
        b: { dataURL: "data:image/svg+xml;base64,BBBB" },
      }),
    ).toBe(false);
  });

  it("returns true for a same-origin /api/files reference", () => {
    expect(
      filesNeedRehydration({ a: { dataURL: "/api/files/d1/f1" } }),
    ).toBe(true);
  });

  it("returns true for an absolute (public S3) http url", () => {
    expect(
      filesNeedRehydration({
        a: { dataURL: "https://bucket.example.com/d1/f1.png" },
      }),
    ).toBe(true);
  });
});

describe("rehydrateFilesFromUrls", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the same object untouched when nothing needs rehydration", async () => {
    const files = { a: { dataURL: "data:image/png;base64,AAAA" } };
    const out = await rehydrateFilesFromUrls(files);
    expect(out).toBe(files);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches an /api/files reference and re-inlines it as a data URL", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      blob: async () => blobFor("image/svg+xml"),
    });
    const files = {
      a: { dataURL: "/api/files/d1/f1", mimeType: "image/svg+xml" },
    };
    const out = await rehydrateFilesFromUrls(files);
    expect(fetchMock).toHaveBeenCalledWith("/api/files/d1/f1", {
      credentials: "include",
    });
    expect(out.a.dataURL.startsWith("data:image/svg+xml;base64,")).toBe(true);
    // original object must not be mutated
    expect(files.a.dataURL).toBe("/api/files/d1/f1");
  });

  it("repairs a missing Content-Type using the file's declared mimeType", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      blob: async () => blobFor(""),
    });
    const out = await rehydrateFilesFromUrls({
      a: { dataURL: "/api/files/d1/f1", mimeType: "image/png" },
    });
    expect(out.a.dataURL.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("keeps the original reference when the fetch fails", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    const out = await rehydrateFilesFromUrls({
      a: { dataURL: "/api/files/d1/f1" },
    });
    expect(out.a.dataURL).toBe("/api/files/d1/f1");
  });

  it("keeps the original reference when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    const out = await rehydrateFilesFromUrls({
      a: { dataURL: "https://bucket.example.com/d1/f1.png" },
    });
    expect(out.a.dataURL).toBe("https://bucket.example.com/d1/f1.png");
  });

  it("only fetches referenced files, leaving inline ones untouched", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      blob: async () => blobFor("image/png"),
    });
    const out = await rehydrateFilesFromUrls({
      inline: { dataURL: "data:image/png;base64,AAAA" },
      remote: { dataURL: "/api/files/d1/f2", mimeType: "image/png" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(out.inline.dataURL).toBe("data:image/png;base64,AAAA");
    expect(out.remote.dataURL.startsWith("data:image/png;base64,")).toBe(true);
  });
});
