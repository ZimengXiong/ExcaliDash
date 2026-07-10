import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
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
});
