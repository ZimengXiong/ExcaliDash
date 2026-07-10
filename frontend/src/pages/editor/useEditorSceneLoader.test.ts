import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { getFilesDelta } from "./shared";
import { useEditorSceneLoader } from "./useEditorSceneLoader";

vi.mock("../../api", () => ({
  getDrawing: vi.fn(),
  getLibrary: vi.fn().mockResolvedValue([]),
  isAxiosError: vi.fn(() => false),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

const makeRefs = () => ({
  elementVersionMap: { current: new Map<string, any>() },
  saveQueue: { current: Promise.resolve() },
  latestElements: { current: [] as readonly any[] },
  initialSceneElements: { current: [] as readonly any[] },
  latestFiles: { current: {} as any },
  isSyncing: { current: false },
  lastSyncedFiles: { current: {} as Record<string, any> },
  lastSyncedElementOrderSig: { current: "" },
  lastPersistedFiles: { current: {} as Record<string, any> },
  currentDrawingVersion: { current: null as number | null },
  lastPersistedElements: { current: [] as readonly any[] },
  suspiciousBlankLoad: { current: false },
  hasSceneChangesSinceLoad: { current: false },
  excalidrawAPI: { current: null as any },
  latestAppState: { current: null as any },
  isBootstrappingScene: { current: true },
  hasHydratedInitialScene: { current: false },
});

const makeParams = (over: Record<string, any> = {}) => ({
  id: "drawing-A",
  user: { id: "u1" },
  location: { pathname: "/editor/drawing-A", search: "", hash: "" },
  navigate: vi.fn(),
  refs: makeRefs(),
  setAccessLevel: vi.fn(),
  setDrawingName: vi.fn(),
  setInitialData: vi.fn(),
  setIsReady: vi.fn(),
  setIsSceneLoading: vi.fn(),
  setLoadError: vi.fn(),
  recordElementVersion: vi.fn(),
  normalizeImageElementStatus: (els?: readonly any[]) => els ?? [],
  ...over,
});

describe("useEditorSceneLoader", () => {
  const getDrawing = vi.mocked(api.getDrawing);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not write a stale load into refs after unmount (race guard)", async () => {
    let resolveDrawing: (value: any) => void = () => {};
    getDrawing.mockReturnValue(
      new Promise((resolve) => {
        resolveDrawing = resolve;
      }) as any,
    );

    const params = makeParams();
    const { unmount } = renderHook(() => useEditorSceneLoader(params));

    // Navigate away before the slow load resolves.
    unmount();

    // The stale response for drawing-A arrives late.
    resolveDrawing({
      name: "A",
      elements: [{ id: "leak", type: "rectangle", version: 1 }],
      files: { leaked: { id: "leaked", dataURL: "data:,x" } },
      appState: {},
      version: 3,
      accessLevel: "owner",
    });
    await Promise.resolve();
    await Promise.resolve();

    // Nothing from the stale load leaked into the persistence refs.
    expect(params.refs.latestElements.current).toEqual([]);
    expect(params.refs.latestFiles.current).toEqual({});
    expect(params.refs.currentDrawingVersion.current).toBeNull();
    expect(params.setInitialData).not.toHaveBeenCalledWith(
      expect.objectContaining({ elements: expect.anything() }),
    );
  });

  it("does not reload when the user object identity changes but the id is stable", async () => {
    getDrawing.mockResolvedValue({
      name: "A",
      elements: [],
      files: {},
      appState: {},
      version: 1,
      accessLevel: "owner",
    } as any);

    // Keep every param stable across renders (as in production, where they
    // come from useState/useCallback) and vary only the user object identity.
    const stable = makeParams();
    const { rerender } = renderHook(
      (props: { user: unknown }) =>
        useEditorSceneLoader({ ...stable, user: props.user }),
      { initialProps: { user: { id: "u1" } as unknown } },
    );

    await waitFor(() => expect(getDrawing).toHaveBeenCalledTimes(1));

    // New object, same user id — must not trigger a second load.
    rerender({ user: { id: "u1" } });
    await Promise.resolve();
    expect(getDrawing).toHaveBeenCalledTimes(1);
  });

  describe("progressive file streaming", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
      vi.stubGlobal("fetch", fetchMock);
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const okPng = () => ({
      ok: true,
      blob: async () =>
        new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
    });

    const drawingWithRef = () => ({
      name: "A",
      elements: [
        { id: "img", type: "image", fileId: "f1", version: 1, status: "saved" },
      ],
      files: { f1: { id: "f1", dataURL: "/api/files/dA/f1", mimeType: "image/png" } },
      appState: {},
      version: 2,
      accessLevel: "owner",
    });

    it("paints the scene without waiting for file fetches, then streams the file in via addFiles", async () => {
      let resolveFetch: (value: any) => void = () => {};
      fetchMock.mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
      );
      getDrawing.mockResolvedValue(drawingWithRef() as any);

      const params = makeParams();
      const addFiles = vi.fn();
      renderHook(() => useEditorSceneLoader(params));
      // The Excalidraw API registers after the loader resets refs.
      params.refs.excalidrawAPI.current = { addFiles };

      // First paint happens with the ref-only files, before the fetch resolves.
      await waitFor(() =>
        expect(params.setInitialData).toHaveBeenCalledWith(
          expect.objectContaining({
            files: expect.objectContaining({
              f1: expect.objectContaining({ dataURL: "/api/files/dA/f1" }),
            }),
          }),
        ),
      );
      expect(params.setIsSceneLoading).toHaveBeenCalledWith(false);
      expect(addFiles).not.toHaveBeenCalled();

      // The file lands late and is pushed into the canvas as an inline dataURL.
      resolveFetch(okPng());
      await waitFor(() => expect(addFiles).toHaveBeenCalledTimes(1));
      const pushed = addFiles.mock.calls[0][0];
      expect(pushed[0].id).toBe("f1");
      expect(pushed[0].dataURL.startsWith("data:image/png;base64,")).toBe(true);

      // The hydrated bytes must not read as a dirty file that gets re-saved.
      expect(params.refs.latestFiles.current.f1.dataURL).toBe(
        params.refs.lastPersistedFiles.current.f1.dataURL,
      );
      expect(
        Object.keys(
          getFilesDelta(
            params.refs.lastPersistedFiles.current,
            params.refs.latestFiles.current,
          ),
        ),
      ).toEqual([]);
    });

    it("aborts file callbacks when the load is cancelled mid-flight", async () => {
      let resolveFetch: (value: any) => void = () => {};
      fetchMock.mockReturnValue(
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
      );
      getDrawing.mockResolvedValue(drawingWithRef() as any);

      const params = makeParams();
      const addFiles = vi.fn();
      const { unmount } = renderHook(() => useEditorSceneLoader(params));
      params.refs.excalidrawAPI.current = { addFiles };

      await waitFor(() =>
        expect(params.setInitialData).toHaveBeenCalledWith(
          expect.objectContaining({ files: expect.anything() }),
        ),
      );

      // Navigate away, then let the in-flight fetch resolve.
      unmount();
      resolveFetch(okPng());
      await Promise.resolve();
      await Promise.resolve();

      // The stale file must not be pushed into the (now unmounted) canvas, and
      // latestFiles keeps the untouched reference.
      expect(addFiles).not.toHaveBeenCalled();
      expect(params.refs.latestFiles.current.f1.dataURL).toBe(
        "/api/files/dA/f1",
      );
    });
  });
});
