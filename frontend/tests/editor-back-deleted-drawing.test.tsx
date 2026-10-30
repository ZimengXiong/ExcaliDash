import React, { useLayoutEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import * as api from "../src/api";
import { useEditorCommands } from "../src/pages/editor/useEditorCommands";
import { useEditorPersistence } from "../src/pages/editor/useEditorPersistence";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
vi.mock("@excalidraw/excalidraw", () => ({
  exportToSvg: vi.fn(async () => ({ outerHTML: "<svg />" })),
}));
vi.mock("../src/api", () => ({
  updateDrawing: vi.fn(),
  updateLibrary: vi.fn(),
  isAxiosError: (error: any) => Boolean(error?.response),
}));
vi.mock("../src/utils/imageCompression", () => ({
  compressExcalidrawFiles: vi.fn(async (files) => ({ files, changed: false })),
}));
vi.mock("../src/utils/exportUtils", () => ({ exportFromEditor: vi.fn() }));
vi.mock("../src/pages/editor/keepaliveSave", () => ({
  saveDrawingKeepalive: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const ref = <T,>(current: T) => ({ current });
const elements = [{ id: "edit", type: "rectangle", version: 2 }];
const appState = { viewBackgroundColor: "#ffffff" };
let renderer: ReactTestRenderer | undefined;

const mountEditor = async () => {
  const liveAPI = {
    getSceneElementsIncludingDeleted: vi.fn(() => elements),
    getAppState: vi.fn(() => appState),
    getFiles: vi.fn(() => ({})),
    updateScene: vi.fn(),
    addFiles: vi.fn(),
  };
  const refs = {
    hasSceneChangesSinceLoad: ref(true),
    currentDrawingVersion: ref<number | null>(1),
    debouncedSave: ref(null),
    excalidrawAPI: ref(liveAPI),
    isSyncing: ref(false),
    isUnmounting: ref(false),
    lastLocalChangeAt: ref(1),
    lastPersistedElements: ref<readonly any[]>([]),
    lastPersistedFiles: ref({}),
    lastSyncedFiles: ref({}),
    latestAppState: ref(appState),
    latestElements: ref<readonly any[]>(elements),
    latestFiles: ref({}),
    saveQueue: ref(Promise.resolve()),
    suspiciousBlankLoad: ref(false),
    uploadedRefs: ref({}),
  };
  const resolveSafeSnapshot = (snapshot: readonly any[] = elements) => ({
    snapshot,
    prevented: false,
    staleEmptySnapshot: false,
    staleNonRenderableSnapshot: false,
  });
  let commands!: ReturnType<typeof useEditorCommands>;
  function Harness() {
    const persistence = useEditorPersistence({
      drawingId: "drawing",
      canEdit: true,
      user: null,
      refs,
      normalizeImageElementStatus: (list = []) => list,
      resolveSafeSnapshot,
    });
    const nextCommands = useEditorCommands({
      autoHideEnabled: false,
      canEdit: true,
      drawingId: "drawing",
      drawingName: "Drawing",
      isSavingOnLeave: false,
      newName: "Drawing",
      user: null,
      refs: {
        ...refs,
        historyRestorePending: persistence.historyRestorePendingRef,
        saveData: persistence.saveDataRef,
        savePreview: persistence.savePreviewRef,
      },
      debouncedSaveLibrary: persistence.debouncedSaveLibrary,
      enqueueSceneSave: persistence.enqueueSceneSave,
      resolveSafeSnapshot,
      setAutoHideEnabled: vi.fn(),
      setDrawingName: vi.fn(),
      setIsHeaderVisible: vi.fn(),
      setIsRenaming: vi.fn(),
      setIsSavingOnLeave: vi.fn(),
      setNewName: vi.fn(),
    });
    useLayoutEffect(() => {
      commands = nextCommands;
    });
    return null;
  }
  await act(async () => {
    renderer = create(<Harness />);
  });
  return () => commands;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { setTimeout, clearTimeout }),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("back navigation with unsaved changes", () => {
  it("leaves the editor when the drawing was deleted while open", async () => {
    vi.mocked(api.updateDrawing).mockRejectedValue({
      response: { status: 404 },
    });
    const commands = await mountEditor();
    await act(async () => {
      await commands().handleBackClick();
    });
    expect(navigate).toHaveBeenCalledWith("/");
    expect(toast.error).toHaveBeenCalledWith(
      "This drawing no longer exists. Changes can't be saved.",
    );
    expect(toast.error).not.toHaveBeenCalledWith(
      "Failed to save changes. Please retry before leaving.",
    );
  });

  it("still stays in the editor when a save fails for another reason", async () => {
    vi.mocked(api.updateDrawing).mockRejectedValue({
      response: { status: 500 },
    });
    const commands = await mountEditor();
    await act(async () => {
      await commands().handleBackClick();
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "Failed to save changes. Please retry before leaving.",
    );
  });
});
