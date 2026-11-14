import React, { useLayoutEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadDrawingFile } from "../src/api";
import { compressExcalidrawFiles } from "../src/utils/imageCompression";
import { useEditorFileUploads } from "../src/pages/editor/useEditorFileUploads";
vi.mock("../src/api", () => ({
  isFileUploadSupported: () => true,
  uploadDrawingFile: vi.fn(),
}));
vi.mock("../src/utils/imageCompression", () => ({
  compressExcalidrawFiles: vi.fn(),
}));
const ref = <T,>(current: T) => ({ current });
const files = {
  image: {
    id: "image",
    dataURL: "data:image/png;base64,aW1hZ2U=",
    mimeType: "image/png",
  },
};
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
let renderer: ReactTestRenderer | undefined;
const harness = () => {
  const editor = { getFiles: () => files, addFiles: vi.fn() };
  const refs = {
    excalidrawAPI: ref(editor),
    isSyncing: ref(false),
    latestFiles: ref<any>(files),
    uploadedRefs: ref<Record<string, string>>({}),
  };
  let uploads!: ReturnType<typeof useEditorFileUploads>;
  function Harness({ drawingId = "drawing" }: { drawingId?: string }) {
    const next = useEditorFileUploads({
      ...refs,
      drawingId,
      canEdit: true,
      isReady: false,
    });
    useLayoutEffect(() => {
      uploads = next;
    });
    return null;
  }
  return {
    refs,
    editor,
    Harness,
    get uploads() {
      return uploads;
    },
  };
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(compressExcalidrawFiles).mockResolvedValue({
    files,
    changed: false,
  });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
});
describe("drawing-scoped uploads", () => {
  it("clears stored refs on drawing changes and ignores completion of an old drawing's upload", async () => {
    const h = harness();
    await act(async () => {
      renderer = create(<h.Harness />);
    });
    const response = deferred<any>();
    vi.mocked(uploadDrawingFile).mockReturnValueOnce(response.promise);
    const upload = h.uploads.scanNow();
    await act(async () => {});
    h.refs.uploadedRefs.current.existing = "/api/files/drawing/existing";
    await act(async () => {
      renderer!.update(<h.Harness drawingId="other" />);
    });
    expect(h.refs.uploadedRefs.current).toEqual({});
    response.resolve({ url: "/api/files/drawing/image" });
    await act(async () => {
      await upload;
    });
    expect(h.refs.uploadedRefs.current).toEqual({});
  });
  it("does not apply an old compression result to a different drawing", async () => {
    const h = harness();
    await act(async () => {
      renderer = create(<h.Harness />);
    });
    const compressed = deferred<any>();
    vi.mocked(compressExcalidrawFiles).mockReturnValueOnce(compressed.promise);
    const upload = h.uploads.scanNow();
    await act(async () => {
      renderer!.update(<h.Harness drawingId="other" />);
    });
    const other = { other: { id: "other", dataURL: "data:other" } };
    h.refs.latestFiles.current = other;
    compressed.resolve({ files, changed: true });
    await act(async () => {
      await upload;
    });
    expect(h.refs.latestFiles.current).toEqual(other);
    expect(h.editor.addFiles).not.toHaveBeenCalled();
    expect(uploadDrawingFile).not.toHaveBeenCalled();
  });
});

describe("upload failure handling (#307)", () => {
  const httpError = (status: number, headers: Record<string, string> = {}) =>
    Object.assign(new Error(`HTTP ${status}`), {
      isAxiosError: true,
      response: { status, headers },
    });

  const scanTimes = async (h: ReturnType<typeof harness>, times: number) => {
    for (let i = 0; i < times; i++) {
      await act(async () => {
        await h.uploads.scanNow();
      });
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const mount = async () => {
    const h = harness();
    await act(async () => {
      renderer = create(<h.Harness />);
    });
    return h;
  };

  it("stops all uploads after a 401 instead of retrying on every scan", async () => {
    const h = await mount();
    vi.mocked(uploadDrawingFile).mockRejectedValue(httpError(401));

    await scanTimes(h, 1);
    expect(uploadDrawingFile).toHaveBeenCalledTimes(1);

    // 50 more scans, 800ms apart (the poll interval), over ~40s.
    for (let i = 0; i < 50; i++) {
      vi.advanceTimersByTime(800);
      await scanTimes(h, 1);
    }
    expect(uploadDrawingFile).toHaveBeenCalledTimes(1);
  });

  it("stops after a 403", async () => {
    const h = await mount();
    vi.mocked(uploadDrawingFile).mockRejectedValue(httpError(403));
    await scanTimes(h, 1);
    vi.advanceTimersByTime(10 * 60_000);
    await scanTimes(h, 3);
    expect(uploadDrawingFile).toHaveBeenCalledTimes(1);
  });

  it("does not retry a file that failed with a non-retryable 4xx like 413", async () => {
    const h = await mount();
    vi.mocked(uploadDrawingFile).mockRejectedValue(httpError(413));
    await scanTimes(h, 1);
    vi.advanceTimersByTime(10 * 60_000);
    await scanTimes(h, 3);
    expect(uploadDrawingFile).toHaveBeenCalledTimes(1);
  });

  it("backs off exponentially, capped, on retryable errors", async () => {
    const h = await mount();
    const attemptTimes: number[] = [];
    vi.mocked(uploadDrawingFile).mockImplementation(async () => {
      attemptTimes.push(Date.now());
      throw httpError(503);
    });

    // Scan every 800ms for 10 simulated minutes.
    const start = Date.now();
    for (let elapsed = 0; elapsed <= 10 * 60_000; elapsed += 800) {
      await scanTimes(h, 1);
      vi.advanceTimersByTime(800);
    }

    const gaps = attemptTimes.slice(1).map((t, i) => t - attemptTimes[i]);
    // Gaps grow (1s, 2s, 4s, ... rounded up to the 800ms scan grid)...
    expect(gaps[0]).toBeGreaterThanOrEqual(1000);
    expect(gaps[1]).toBeGreaterThanOrEqual(2000);
    expect(gaps[2]).toBeGreaterThanOrEqual(4000);
    // ...and never exceed the 60s cap (plus one scan interval of slack).
    expect(Math.max(...gaps)).toBeLessThanOrEqual(60_000 + 800);
    expect(Math.max(...gaps)).toBeGreaterThanOrEqual(60_000);
    // Far fewer requests than one per scan (~750) over 10 minutes.
    expect(attemptTimes.length).toBeLessThan(20);
    expect(attemptTimes[0]).toBe(start);
  });

  it("resumes uploading after a retryable failure once the backoff elapses, and records the ref", async () => {
    const h = await mount();
    vi.mocked(uploadDrawingFile)
      .mockRejectedValueOnce(httpError(429))
      .mockResolvedValueOnce({ url: "/api/files/drawing/image" });

    await scanTimes(h, 1);
    expect(uploadDrawingFile).toHaveBeenCalledTimes(1);

    // Still inside the backoff window: no request.
    vi.advanceTimersByTime(500);
    await scanTimes(h, 1);
    expect(uploadDrawingFile).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(600);
    await scanTimes(h, 1);
    expect(uploadDrawingFile).toHaveBeenCalledTimes(2);
    expect(h.refs.uploadedRefs.current.image).toBe("/api/files/drawing/image");
  });

  it("honors Retry-After on 429 when it is longer than the backoff", async () => {
    const h = await mount();
    vi.mocked(uploadDrawingFile).mockRejectedValue(
      httpError(429, { "retry-after": "30" }),
    );
    await scanTimes(h, 1);
    vi.advanceTimersByTime(29_000);
    await scanTimes(h, 1);
    expect(uploadDrawingFile).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1_500);
    await scanTimes(h, 1);
    expect(uploadDrawingFile).toHaveBeenCalledTimes(2);
  });

  it("clears the failure state when moving to another drawing", async () => {
    const h = await mount();
    vi.mocked(uploadDrawingFile).mockRejectedValueOnce(httpError(401));
    await scanTimes(h, 1);
    expect(uploadDrawingFile).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer!.update(<h.Harness drawingId="other" />);
    });
    vi.mocked(uploadDrawingFile).mockResolvedValueOnce({
      url: "/api/files/other/image",
    });
    await scanTimes(h, 1);
    expect(uploadDrawingFile).toHaveBeenCalledTimes(2);
  });
});
