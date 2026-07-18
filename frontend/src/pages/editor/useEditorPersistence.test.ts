import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { useEditorPersistence } from "./useEditorPersistence";

vi.mock("@excalidraw/excalidraw", () => ({ exportToSvg: vi.fn() }));
vi.mock("../../api", () => ({
  updateDrawing: vi.fn(),
  updateLibrary: vi.fn(),
  getDrawing: vi.fn(),
  isAxiosError: vi.fn(() => false),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
vi.mock("../../utils/imageCompression", () => ({
  compressExcalidrawFiles: vi.fn(async (files: any) => ({
    changed: false,
    files,
  })),
}));

const makeRefs = () => ({
  currentDrawingVersion: { current: 1 as number | null },
  debouncedSave: { current: null as any },
  excalidrawAPI: { current: null as any },
  isSyncing: { current: false },
  isUnmounting: { current: false },
  libraryHydrated: { current: true },
  libraryItems: { current: [] as readonly any[] },
  libraryVersion: { current: 0 },
  lastLocalChangeAt: { current: 0 },
  lastPersistedElements: { current: [] as readonly any[] },
  lastPersistedFiles: { current: {} as Record<string, any> },
  lastSyncedFiles: { current: {} as Record<string, any> },
  latestAppState: { current: {} as any },
  latestElements: { current: [] as readonly any[] },
  latestFiles: { current: {} as any },
  saveQueue: { current: Promise.resolve() },
  suspiciousBlankLoad: { current: false },
  uploadedRefs: { current: {} as Record<string, string> },
});

const params = (refs: ReturnType<typeof makeRefs>) => ({
  refs,
  user: { id: "u1" },
  normalizeImageElementStatus: (els?: readonly any[]) => els ?? [],
  resolveSafeSnapshot: (s?: readonly any[]) => ({
    snapshot: s ?? [],
    prevented: false,
    staleEmptySnapshot: false,
    staleNonRenderableSnapshot: false,
  }),
});

const els = [{ id: "a", type: "rectangle", version: 1 }];

describe("useEditorPersistence autosave indicator", () => {
  const updateDrawing = vi.mocked(api.updateDrawing);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("raises autosaveFailing after repeated autosave failures and clears on success", async () => {
    updateDrawing.mockRejectedValue(new Error("network"));
    const refs = makeRefs();
    const { result } = renderHook(() => useEditorPersistence(params(refs)));

    await act(async () => {
      await result.current.enqueueSceneSave("d1", els, {}, {});
      await result.current.enqueueSceneSave("d1", els, {}, {});
    });

    await waitFor(() => expect(result.current.autosaveFailing).toBe(true));

    // A subsequent successful save clears the indicator.
    updateDrawing.mockResolvedValue({ version: 2 } as any);
    await act(async () => {
      await result.current.enqueueSceneSave("d1", els, {}, {});
    });
    await waitFor(() => expect(result.current.autosaveFailing).toBe(false));
  });
});

describe("useEditorPersistence file ref substitution", () => {
  const updateDrawing = vi.mocked(api.updateDrawing);

  beforeEach(() => {
    vi.clearAllMocks();
    updateDrawing.mockResolvedValue({ version: 2 } as any);
  });

  const inlineFiles = (id: string) => ({
    [id]: {
      id,
      mimeType: "image/webp",
      created: 1,
      dataURL: "data:image/webp;base64,QUJD",
    },
  });

  const bodyOf = () => updateDrawing.mock.calls[0][1] as any;

  it("ships an uploaded file as a ref and drops the base64 bytes", async () => {
    const refs = makeRefs();
    refs.uploadedRefs.current = { a: "/api/files/d1/a" };
    const { result } = renderHook(() => useEditorPersistence(params(refs)));

    await act(async () => {
      await result.current.enqueueSceneSave("d1", els, {}, inlineFiles("a"), {
        suppressErrors: false,
      });
    });

    expect(updateDrawing).toHaveBeenCalledTimes(1);
    expect(bodyOf().files.a.dataURL).toBe("/api/files/d1/a");
    expect(bodyOf().files.a.dataURL.startsWith("data:")).toBe(false);
    // lastPersistedFiles records the ref-shaped entry it actually sent.
    expect(refs.lastPersistedFiles.current.a.dataURL).toBe("/api/files/d1/a");
  });

  it("keeps unuploaded inline bytes out of persisted scene payloads", async () => {
    const refs = makeRefs(); // uploadedRefs empty
    const { result } = renderHook(() => useEditorPersistence(params(refs)));

    await act(async () => {
      await result.current.enqueueSceneSave("d1", els, {}, inlineFiles("a"), {
        suppressErrors: false,
      });
    });

    expect(bodyOf().files).toBeUndefined();
    expect(refs.lastPersistedFiles.current).toEqual({});
  });

  it("does not send inline bytes when the upload endpoint is unavailable", async () => {
    // Inline bytes remain local rather than entering JSON/socket payloads.
    const refs = makeRefs();
    const { result } = renderHook(() => useEditorPersistence(params(refs)));

    await act(async () => {
      await result.current.enqueueSceneSave("d1", els, {}, inlineFiles("a"), {
        suppressErrors: false,
      });
    });

    expect(bodyOf().files).toBeUndefined();
  });
});

describe("useEditorPersistence unmount flush", () => {
  const updateDrawing = vi.mocked(api.updateDrawing);

  beforeEach(() => {
    vi.clearAllMocks();
    updateDrawing.mockResolvedValue({ version: 2 } as any);
  });

  it("flushes a pending debounced save on unmount instead of cancelling it", async () => {
    const refs = makeRefs();
    const { result, unmount } = renderHook(() =>
      useEditorPersistence(params(refs)),
    );

    // Queue a debounced save; without a flush-on-unmount it would be dropped.
    act(() => {
      result.current.debouncedSave("d1", els, {}, {});
    });
    expect(updateDrawing).not.toHaveBeenCalled();

    unmount();
    await waitFor(() => expect(updateDrawing).toHaveBeenCalledTimes(1));
  });
});
