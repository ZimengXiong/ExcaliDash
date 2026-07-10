import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FormEvent } from "react";
import * as api from "../../api";
import { toast } from "sonner";
import { useEditorCommands } from "./useEditorCommands";

vi.mock("../../api", () => ({
  updateDrawing: vi.fn(),
  isAxiosError: vi.fn(() => false),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("../../utils/exportUtils", () => ({ exportFromEditor: vi.fn() }));
vi.mock("./keepaliveSave", () => ({ saveDrawingKeepalive: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));

const makeRefs = () => ({
  currentDrawingVersion: { current: 1 as number | null },
  excalidrawAPI: { current: null as any },
  hasSceneChangesSinceLoad: { current: false },
  latestFiles: { current: {} as any },
  saveData: { current: vi.fn() as any },
  savePreview: { current: vi.fn() as any },
  suspiciousBlankLoad: { current: false },
  uploadedRefs: { current: {} as Record<string, string> },
});

const baseParams = (over: Record<string, any> = {}) => ({
  autoHideEnabled: false,
  canEdit: true,
  debouncedSaveLibrary: vi.fn(),
  drawingId: "d1",
  drawingName: "Old Name",
  enqueueSceneSave: vi.fn().mockResolvedValue(undefined),
  isSavingOnLeave: false,
  newName: "New Name",
  refs: makeRefs(),
  resolveSafeSnapshot: (s?: readonly any[]) => ({
    snapshot: s ?? [],
    prevented: false,
    staleEmptySnapshot: false,
    staleNonRenderableSnapshot: false,
  }),
  setAutoHideEnabled: vi.fn(),
  setDrawingName: vi.fn(),
  setIsHeaderVisible: vi.fn(),
  setIsRenaming: vi.fn(),
  setIsSavingOnLeave: vi.fn(),
  setNewName: vi.fn(),
  user: { id: "u1" },
  ...over,
});

const fakeEvent = () => ({ preventDefault: vi.fn() }) as unknown as FormEvent;

describe("useEditorCommands rename", () => {
  const updateDrawing = vi.mocked(api.updateDrawing);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("trims the new name before persisting and optimistically applies it", async () => {
    updateDrawing.mockResolvedValue({} as any);
    const params = baseParams({ newName: "  Trimmed  " });
    const { result } = renderHook(() => useEditorCommands(params));

    await act(async () => {
      await result.current.handleRenameSubmit(fakeEvent());
    });

    expect(params.setDrawingName).toHaveBeenCalledWith("Trimmed");
    expect(updateDrawing).toHaveBeenCalledWith("d1", { name: "Trimmed" });
  });

  it("reverts the name and toasts when the rename request fails", async () => {
    updateDrawing.mockRejectedValue(new Error("boom"));
    const params = baseParams({ newName: "Attempted", drawingName: "Old Name" });
    const { result } = renderHook(() => useEditorCommands(params));

    await act(async () => {
      await result.current.handleRenameSubmit(fakeEvent());
    });

    // Optimistic set, then revert back to the previous name.
    expect(params.setDrawingName).toHaveBeenNthCalledWith(1, "Attempted");
    expect(params.setDrawingName).toHaveBeenNthCalledWith(2, "Old Name");
    expect(toast.error).toHaveBeenCalledWith("Failed to rename drawing");
  });

  it("saves nothing for an empty (whitespace-only) name", async () => {
    const params = baseParams({ newName: "   " });
    const { result } = renderHook(() => useEditorCommands(params));

    await act(async () => {
      await result.current.handleRenameSubmit(fakeEvent());
    });

    expect(updateDrawing).not.toHaveBeenCalled();
    expect(params.setIsRenaming).toHaveBeenCalledWith(false);
  });

  it("saves nothing when the name is unchanged", async () => {
    const params = baseParams({ newName: "Old Name", drawingName: "Old Name" });
    const { result } = renderHook(() => useEditorCommands(params));

    await act(async () => {
      await result.current.handleRenameSubmit(fakeEvent());
    });

    expect(updateDrawing).not.toHaveBeenCalled();
  });
});

describe("useEditorCommands Ctrl+S", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const pressCtrlS = () => {
    const event = new KeyboardEvent("keydown", { key: "s", ctrlKey: true });
    window.dispatchEvent(event);
  };

  it("only toasts success after a save that actually succeeds", async () => {
    const enqueueSceneSave = vi.fn().mockResolvedValue(undefined);
    const refs = makeRefs();
    refs.excalidrawAPI.current = {
      getSceneElementsIncludingDeleted: () => [{ id: "a" }],
      getAppState: () => ({}),
      getFiles: () => ({}),
    };
    const params = baseParams({ enqueueSceneSave, refs });
    renderHook(() => useEditorCommands(params));

    await act(async () => {
      pressCtrlS();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(enqueueSceneSave).toHaveBeenCalledWith(
      "d1",
      expect.anything(),
      expect.anything(),
      expect.anything(),
      { suppressErrors: false },
    );
    expect(toast.success).toHaveBeenCalledWith("Saved changes to server");
  });

  it("does not toast success when the save fails", async () => {
    const enqueueSceneSave = vi.fn().mockRejectedValue(new Error("save failed"));
    const refs = makeRefs();
    refs.excalidrawAPI.current = {
      getSceneElementsIncludingDeleted: () => [{ id: "a" }],
      getAppState: () => ({}),
      getFiles: () => ({}),
    };
    const params = baseParams({ enqueueSceneSave, refs });
    renderHook(() => useEditorCommands(params));

    await act(async () => {
      pressCtrlS();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toast.success).not.toHaveBeenCalled();
    expect(refs.savePreview.current).not.toHaveBeenCalled();
  });
});
