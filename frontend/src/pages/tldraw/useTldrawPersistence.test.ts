import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updateDrawing = vi.fn();
const getDrawing = vi.fn();
const isAxiosError = vi.fn();
const saveDrawingKeepalive = vi.fn();
const loadSnapshot = vi.fn();
const readSceneSnapshot = vi.fn(() => ({
  document: { store: { "shape:a": {} }, schema: {} },
  session: { version: 1 },
}));
const generateScenePreview = vi.fn(async () => "<svg></svg>");

vi.mock("../../api", () => ({
  updateDrawing: (...a: unknown[]) => updateDrawing(...a),
  getDrawing: (...a: unknown[]) => getDrawing(...a),
  isAxiosError: (...a: unknown[]) => isAxiosError(...a),
}));
vi.mock("../editor/keepaliveSave", () => ({
  saveDrawingKeepalive: (...a: unknown[]) => saveDrawingKeepalive(...a),
}));
vi.mock("tldraw", () => ({
  loadSnapshot: (...a: unknown[]) => loadSnapshot(...a),
}));
vi.mock("./tldrawSceneIo", () => ({
  readSceneSnapshot: (...a: unknown[]) => readSceneSnapshot(...a),
  generateScenePreview: (...a: unknown[]) => generateScenePreview(...a),
}));

import { useTldrawPersistence } from "./useTldrawPersistence";

const makeEditor = () => {
  let changeHandler: (() => void) | undefined;
  const unlisten = vi.fn();
  const editor = {
    store: {
      listen: vi.fn((cb: () => void) => {
        changeHandler = cb;
        return unlisten;
      }),
    },
  };
  return { editor, fireChange: () => changeHandler?.(), unlisten };
};

const flushSave = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
};

describe("useTldrawPersistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    isAxiosError.mockReturnValue(false);
    updateDrawing.mockResolvedValue({ version: 6 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces a document change into a versioned save", async () => {
    const { editor, fireChange } = makeEditor();
    const { result } = renderHook(() =>
      useTldrawPersistence({
        drawingId: "d1",
        editor: editor as never,
        canEdit: true,
        initialVersion: 5,
      }),
    );

    act(() => fireChange());
    expect(result.current.hasUnsavedChanges).toBe(true);
    // No save until the debounce elapses.
    expect(updateDrawing).not.toHaveBeenCalled();

    await flushSave();

    expect(updateDrawing).toHaveBeenCalledOnce();
    const [id, body] = updateDrawing.mock.calls[0];
    expect(id).toBe("d1");
    expect(body).toMatchObject({
      elements: { store: { "shape:a": {} }, schema: {} },
      appState: { version: 1 },
      version: 5,
      preview: "<svg></svg>",
    });
    expect(result.current.saveStatus).toBe("saved");
    expect(result.current.hasUnsavedChanges).toBe(false);
  });

  it("surfaces a version conflict on a 409", async () => {
    isAxiosError.mockReturnValue(true);
    updateDrawing.mockRejectedValueOnce({
      response: { status: 409, data: { currentVersion: 9 } },
    });
    const { editor, fireChange } = makeEditor();
    const { result } = renderHook(() =>
      useTldrawPersistence({
        drawingId: "d1",
        editor: editor as never,
        canEdit: true,
        initialVersion: 5,
      }),
    );

    act(() => fireChange());
    await flushSave();

    expect(result.current.conflict).toEqual({ currentVersion: 9 });
    expect(result.current.saveStatus).toBe("error");
  });

  it("overwrites by re-saving without a version guard", async () => {
    isAxiosError.mockReturnValue(true);
    updateDrawing.mockRejectedValueOnce({
      response: { status: 409, data: { currentVersion: 9 } },
    });
    const { editor, fireChange } = makeEditor();
    const { result } = renderHook(() =>
      useTldrawPersistence({
        drawingId: "d1",
        editor: editor as never,
        canEdit: true,
        initialVersion: 5,
      }),
    );

    act(() => fireChange());
    await flushSave();
    expect(result.current.conflict).not.toBeNull();

    updateDrawing.mockResolvedValueOnce({ version: 10 });
    await act(async () => {
      await result.current.overwriteServer();
    });

    // The forced overwrite PUT omits the version so the backend guard is skipped.
    const lastCall = updateDrawing.mock.calls.at(-1)!;
    expect(lastCall[1].version).toBeUndefined();
    expect(result.current.conflict).toBeNull();
  });

  it("reloads the latest scene and clears the conflict", async () => {
    getDrawing.mockResolvedValue({
      elements: { store: { "shape:b": {} }, schema: {} },
      appState: { version: 2 },
      version: 12,
    });
    const { editor } = makeEditor();
    const { result } = renderHook(() =>
      useTldrawPersistence({
        drawingId: "d1",
        editor: editor as never,
        canEdit: true,
        initialVersion: 5,
      }),
    );

    await act(async () => {
      await result.current.reloadFromServer();
    });

    expect(getDrawing).toHaveBeenCalledWith("d1");
    expect(loadSnapshot).toHaveBeenCalledOnce();
    expect(result.current.conflict).toBeNull();
    expect(result.current.hasUnsavedChanges).toBe(false);
  });

  it("flushes via keepalive on pagehide", () => {
    const { editor } = makeEditor();
    renderHook(() =>
      useTldrawPersistence({
        drawingId: "d1",
        editor: editor as never,
        canEdit: true,
        initialVersion: 5,
      }),
    );

    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(saveDrawingKeepalive).toHaveBeenCalledOnce();
    const [id, body] = saveDrawingKeepalive.mock.calls[0];
    expect(id).toBe("d1");
    expect(body).toMatchObject({
      elements: { store: { "shape:a": {} }, schema: {} },
      appState: { version: 1 },
      version: 5,
    });
  });

  it("does not subscribe or flush for view-only access", () => {
    const { editor } = makeEditor();
    renderHook(() =>
      useTldrawPersistence({
        drawingId: "d1",
        editor: editor as never,
        canEdit: false,
        initialVersion: 5,
      }),
    );

    expect(editor.store.listen).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(saveDrawingKeepalive).not.toHaveBeenCalled();
  });
});
