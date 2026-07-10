import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  filesNeedRehydration,
  rehydrateFilesFromUrls,
  rehydrateFilesProgressive,
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

describe("rehydrateFilesProgressive", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing (no fetch, no callback) when nothing needs rehydration", async () => {
    const onReady = vi.fn();
    await rehydrateFilesProgressive(
      { a: { dataURL: "data:image/png;base64,AAAA" } },
      onReady,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
  });

  it("invokes onFileReady per completed fetch with an inlined data URL", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      blob: async () => blobFor("image/png"),
    });
    const onReady = vi.fn();
    await rehydrateFilesProgressive(
      {
        inline: { dataURL: "data:image/png;base64,AAAA" },
        r1: { dataURL: "/api/files/d1/r1", mimeType: "image/png" },
        r2: { dataURL: "/api/files/d1/r2", mimeType: "image/png" },
      },
      onReady,
    );
    // Only the two references were fetched; the inline entry was skipped.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onReady).toHaveBeenCalledTimes(2);
    const byId = Object.fromEntries(
      onReady.mock.calls.map(([id, file]) => [id, file]),
    );
    expect(byId.r1.dataURL.startsWith("data:image/png;base64,")).toBe(true);
    expect(byId.r2.dataURL.startsWith("data:image/png;base64,")).toBe(true);
    expect(byId.inline).toBeUndefined();
  });

  it("skips onFileReady for a file whose fetch fails, leaving others intact", async () => {
    fetchMock.mockImplementation((url: string) =>
      url.endsWith("bad")
        ? Promise.resolve({ ok: false })
        : Promise.resolve({ ok: true, blob: async () => blobFor("image/png") }),
    );
    const onReady = vi.fn();
    await rehydrateFilesProgressive(
      {
        good: { dataURL: "/api/files/d1/good", mimeType: "image/png" },
        bad: { dataURL: "/api/files/d1/bad", mimeType: "image/png" },
      },
      onReady,
    );
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady.mock.calls[0][0]).toBe("good");
  });

  it("stops dispatching and does not call back once isCancelled flips true", async () => {
    let cancelled = false;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          // Cancel before the (single, held) fetch resolves.
          cancelled = true;
          resolve({ ok: true, blob: async () => blobFor("image/png") });
        }),
    );
    const onReady = vi.fn();
    await rehydrateFilesProgressive(
      { r1: { dataURL: "/api/files/d1/r1", mimeType: "image/png" } },
      onReady,
      () => cancelled,
    );
    expect(onReady).not.toHaveBeenCalled();
  });
});
