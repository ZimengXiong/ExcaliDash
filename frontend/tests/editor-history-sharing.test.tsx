import React, { useLayoutEffect, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorDialogs } from "../src/pages/editor/EditorDialogs";
import { EditorView } from "../src/pages/editor/EditorView";
import { HistoryPreviewCanvas } from "../src/pages/editor/HistoryPreviewCanvas";
import { useEditorChrome } from "../src/pages/editor/useEditorChrome";
import { useEditorPersistence } from "../src/pages/editor/useEditorPersistence";
import { useEditorCommands } from "../src/pages/editor/useEditorCommands";
import { ShareModal } from "../src/components/ShareModal";
import * as api from "../src/api";
import { exportToSvg } from "@excalidraw/excalidraw";
import { saveDrawingKeepalive } from "../src/pages/editor/keepaliveSave";
import type { DrawingSnapshotFull } from "../src/api";
import { validateEmbeddableUrl } from "../src/pages/editor/shared";

const { portalTargets } = vi.hoisted(() => ({
  portalTargets: [] as unknown[],
}));
vi.mock("react-dom", () => ({
  createPortal: (children: React.ReactNode, target: unknown) => {
    portalTargets.push(target);
    return children;
  },
}));
vi.mock("@excalidraw/excalidraw", () => {
  const Item = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  return {
    Excalidraw: (props: Record<string, unknown>) =>
      React.createElement("mock-canvas", props),
    MainMenu: Object.assign(Item, {
      Item,
      ItemCustom: Item,
      Separator: () => null,
      DefaultItems: {
        SaveAsImage: () => null,
        ClearCanvas: () => null,
        ChangeCanvasBackground: () => null,
        Help: () => null,
      },
    }),
    exportToSvg: vi.fn(async () => ({ outerHTML: "<svg />" })),
  };
});
vi.mock("../src/api", () => ({
  updateDrawing: vi.fn(async () => ({ version: 2 })),
  updateLibrary: vi.fn(),
  getDrawingHistory: vi.fn(),
  getDrawingSnapshot: vi.fn(),
  getDrawingSharing: vi.fn(async () => ({ permissions: [], linkShares: [] })),
  isAxiosError: () => false,
}));
vi.mock("../src/utils/imageCompression", () => ({
  compressExcalidrawFiles: vi.fn(async (files) => ({ files, changed: false })),
}));
vi.mock("../src/utils/exportUtils", () => ({ exportFromEditor: vi.fn() }));
vi.mock("../src/pages/editor/keepaliveSave", () => ({
  saveDrawingKeepalive: vi.fn(),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ user: null }),
}));
vi.mock("../src/components/LanguageSelector", () => ({
  LanguageSelector: () => null,
}));
vi.mock("../src/components/GridStepSelector", () => ({
  GridStepSelector: () => null,
}));
vi.mock("../src/components/UserAvatar", () => ({ UserAvatar: () => null }));
vi.mock("sonner", () => ({
  Toaster: () => null,
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const ref = <T,>(current: T) => ({ current });
const liveElements = [{ id: "live", type: "rectangle", version: 9 }];
const liveAppState = {
  viewBackgroundColor: "#ffffff",
  collaborators: new Map(),
};
const liveFiles = { liveImage: { id: "liveImage", dataURL: "data:live" } };
const historicalSnapshot = {
  id: "old",
  version: 1,
  createdAt: "2026-10-01T00:00:00Z",
  elements: [{ id: "historical", type: "rectangle", version: 1 }],
  appState: { viewBackgroundColor: "#123456", collaborators: {} },
  files: { oldImage: { id: "oldImage", dataURL: "data:old" } },
} as DrawingSnapshotFull;
const renderers: ReactTestRenderer[] = [];
let testWindow: EventTarget & {
  innerWidth: number;
  location: Record<string, unknown>;
};

const render = async (element: React.ReactElement) => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(element);
  });
  renderers.push(renderer);
  return renderer;
};
const settle = async () => {
  await act(async () => {});
};
const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(api.updateDrawing)
    .mockReset()
    .mockResolvedValue({ version: 2 } as never);
  portalTargets.length = 0;
  testWindow = Object.assign(new EventTarget(), {
    innerWidth: 1200,
    location: { origin: "https://example.test", reload: vi.fn() },
    setTimeout,
    clearTimeout,
  });
  vi.stubGlobal("window", testWindow);
  vi.stubGlobal("document", { body: {}, title: "" });
  vi.mocked(api.getDrawingHistory).mockResolvedValue({
    snapshots: [historicalSnapshot],
    totalCount: 1,
  });
  vi.mocked(api.getDrawingSnapshot).mockResolvedValue(historicalSnapshot);
});
afterEach(async () => {
  await act(async () => {
    renderers.splice(0).forEach((renderer) => renderer.unmount());
  });
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function persistenceHarness() {
  const liveAPI = {
    getSceneElementsIncludingDeleted: vi.fn(() => liveElements),
    getAppState: vi.fn(() => liveAppState),
    getFiles: vi.fn(() => liveFiles),
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
    lastPersistedElements: ref(liveElements),
    lastPersistedFiles: ref({}),
    lastSyncedFiles: ref({}),
    latestAppState: ref(liveAppState),
    latestElements: ref(liveElements),
    latestFiles: ref(liveFiles),
    saveQueue: ref(Promise.resolve()),
    suspiciousBlankLoad: ref(false),
    uploadedRefs: ref({}),
  };
  const resolveSafeSnapshot = (elements = refs.latestElements.current) => ({
    snapshot: elements,
    prevented: false,
    staleEmptySnapshot: false,
    staleNonRenderableSnapshot: false,
  });
  let persistence!: ReturnType<typeof useEditorPersistence>;
  let commands!: ReturnType<typeof useEditorCommands>;
  function Harness() {
    const nextPersistence = useEditorPersistence({
      canEdit: true,
      user: null,
      refs,
      normalizeImageElementStatus: (elements = []) => elements,
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
        historyRestorePending: nextPersistence.historyRestorePendingRef,
        saveData: nextPersistence.saveDataRef,
        savePreview: nextPersistence.savePreviewRef,
      },
      debouncedSaveLibrary: nextPersistence.debouncedSaveLibrary,
      enqueueSceneSave: nextPersistence.enqueueSceneSave,
      resolveSafeSnapshot,
      setAutoHideEnabled: vi.fn(),
      setDrawingName: vi.fn(),
      setIsHeaderVisible: vi.fn(),
      setIsRenaming: vi.fn(),
      setIsSavingOnLeave: vi.fn(),
      setNewName: vi.fn(),
    });
    useLayoutEffect(() => {
      persistence = nextPersistence;
      commands = nextCommands;
    });
    const [preview, setPreview] = useState<DrawingSnapshotFull | null>(null);
    const [open, setOpen] = useState(true);
    return (
      <>
        <EditorDialogs
          drawingId="drawing"
          historyButtonRef={ref(null)}
          getCurrentVersion={() => refs.currentDrawingVersion.current}
          isHistoryOpen={open}
          onCloseHistory={() => setOpen(false)}
          onPreviewHistory={setPreview}
          onRestoreSnapshot={(id) =>
            nextPersistence.runHistoryRestore("drawing", async () => {
              expect(id).toBe("old");
            })
          }
        />
        {open && preview ? (
          <HistoryPreviewCanvas
            snapshot={preview}
            theme="light"
            langCode="en"
          />
        ) : null}
      </>
    );
  }
  return {
    Harness,
    refs,
    liveAPI,
    get persistence() {
      return persistence;
    },
    get commands() {
      return commands;
    },
  };
}

const clickSnapshot = async (renderer: ReactTestRenderer) => {
  const row = renderer.root.findAll(
    (node) =>
      node.type === "div" &&
      node.props.className?.includes("cursor-pointer select-none"),
  )[0];
  await act(async () => {
    await row.props.onClick();
  });
};

describe("isolated history preview", () => {
  it("never exposes historical elements/files to pending autosaves, thumbnails, manual or unload saves", async () => {
    const h = persistenceHarness();
    const renderer = await render(<h.Harness />);
    h.persistence.debouncedSave(
      "drawing",
      liveElements,
      liveAppState,
      liveFiles,
    );
    h.persistence.debouncedSavePreview("drawing");
    await clickSnapshot(renderer);
    const preview = renderer.root.findByType(
      "mock-canvas" as React.ElementType,
    );
    expect(preview.props.initialData.elements).toEqual(
      historicalSnapshot.elements,
    );
    expect(preview.props.initialData.files).toEqual(historicalSnapshot.files);
    expect(preview.props.validateEmbeddable).toBe(validateEmbeddableUrl);
    expect(
      preview.props.validateEmbeddable("https://example.com/embedded"),
    ).toBe(true);
    expect(preview.props.validateEmbeddable("javascript:alert(1)")).toBe(false);
    expect(preview.props.initialData.appState).not.toHaveProperty(
      "collaborators",
    );
    expect(preview.props.viewModeEnabled).toBe(true);
    for (const callback of [
      "onChange",
      "excalidrawAPI",
      "onPointerUpdate",
      "onLibraryChange",
    ]) {
      expect(preview.props[callback]).toBeUndefined();
    }
    await advance(31_000);
    const key = Object.assign(new Event("keydown", { cancelable: true }), {
      ctrlKey: true,
      key: "s",
    });
    testWindow.dispatchEvent(key);
    await settle();
    testWindow.dispatchEvent(new Event("pagehide"));
    expect(api.updateDrawing).toHaveBeenCalledWith(
      "drawing",
      expect.objectContaining({ elements: liveElements }),
    );
    const sceneWrites = vi
      .mocked(api.updateDrawing)
      .mock.calls.filter(([, data]) => data.elements);
    expect(sceneWrites.length).toBeGreaterThan(0);
    sceneWrites.forEach(([, data]) => {
      expect(data.elements).toEqual(liveElements);
      expect(data.files ?? {}).not.toHaveProperty("oldImage");
    });
    expect(exportToSvg).toHaveBeenCalledWith(
      expect.objectContaining({ elements: liveElements, files: liveFiles }),
    );
    expect(saveDrawingKeepalive).toHaveBeenCalledWith(
      "drawing",
      expect.objectContaining({ elements: liveElements, files: liveFiles }),
    );
    expect(h.liveAPI.updateScene).not.toHaveBeenCalled();
    expect(h.liveAPI.addFiles).not.toHaveBeenCalled();
    expect(h.refs.latestElements.current).toBe(liveElements);
    expect(h.refs.latestFiles.current).toBe(liveFiles);
  });

  it("cancels preview without overwriting live collaboration changes", async () => {
    const h = persistenceHarness();
    const renderer = await render(<h.Harness />);
    await clickSnapshot(renderer);
    const remoteElements = [
      { id: "peer-update", type: "rectangle", version: 10 },
    ];
    h.refs.latestElements.current = remoteElements;
    h.liveAPI.getSceneElementsIncludingDeleted.mockReturnValue(remoteElements);
    await act(async () =>
      renderer.root
        .findByProps({ "aria-label": "Close version history" })
        .props.onClick(),
    );
    expect(
      renderer.root.findAllByType("mock-canvas" as React.ElementType),
    ).toHaveLength(0);
    expect(h.liveAPI.getSceneElementsIncludingDeleted()).toBe(remoteElements);
    expect(h.liveAPI.updateScene).not.toHaveBeenCalled();
    expect(h.liveAPI.addFiles).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation before restoring and reloading", async () => {
    const h = persistenceHarness();
    const renderer = await render(<h.Harness />);
    await clickSnapshot(renderer);
    expect(api.updateDrawing).not.toHaveBeenCalled();
    const restoreButton = () =>
      renderer.root.findAll(
        (node) =>
          node.type === "button" &&
          node.children.some(
            (child) => child === "Restore" || child === "Confirm?",
          ),
      )[0];
    await act(async () => {
      await restoreButton().props.onClick();
    });
    expect(api.updateDrawing).not.toHaveBeenCalled();
    expect(window.location.reload).not.toHaveBeenCalled();
    await act(async () => {
      await restoreButton().props.onClick();
    });
    expect(api.updateDrawing).toHaveBeenCalledWith(
      "drawing",
      expect.objectContaining({ elements: liveElements }),
    );
    expect(h.persistence.historyRestorePendingRef.current).toBe(true);
    expect(window.location.reload).toHaveBeenCalledOnce();
  });

  it("waits for live scene and in-flight thumbnail saves before restore and blocks late writes through reload", async () => {
    const h = persistenceHarness();
    await render(<h.Harness />);
    let finishScene!: () => void;
    let finishPreview!: () => void;
    vi.mocked(api.updateDrawing)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishPreview = () => resolve({ version: 2 } as never);
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishScene = () => resolve({ version: 3 } as never);
          }),
      );
    const previewSave = h.persistence.savePreviewRef.current!(
      "drawing",
      liveElements,
      liveAppState,
      liveFiles,
    );
    await settle();
    h.persistence.debouncedSave(
      "drawing",
      liveElements,
      liveAppState,
      liveFiles,
    );
    h.persistence.debouncedSavePreview("drawing");
    const restore = vi.fn(async () => {});
    const restoring = h.persistence.runHistoryRestore("drawing", restore);
    await settle();
    expect(restore).not.toHaveBeenCalled();
    finishScene();
    await settle();
    expect(restore).not.toHaveBeenCalled();
    finishPreview();
    await act(async () => {
      await previewSave;
      await restoring;
    });
    expect(restore).toHaveBeenCalledOnce();
    const writes = vi.mocked(api.updateDrawing).mock.calls.length;
    h.persistence.debouncedSave(
      "drawing",
      liveElements,
      liveAppState,
      liveFiles,
    );
    await h.persistence.enqueueSceneSave(
      "drawing",
      liveElements,
      liveAppState,
      liveFiles,
    );
    await h.commands.handleBackClick();
    testWindow.dispatchEvent(new Event("pagehide"));
    await advance(31_000);
    expect(api.updateDrawing).toHaveBeenCalledTimes(writes);
    expect(saveDrawingKeepalive).not.toHaveBeenCalled();
    expect(h.persistence.historyRestorePendingRef.current).toBe(true);
  });

  it("backs up the newest live API scene instead of stale debounce arguments", async () => {
    const h = persistenceHarness();
    await render(<h.Harness />);
    h.persistence.debouncedSave(
      "drawing",
      liveElements,
      liveAppState,
      liveFiles,
    );
    const newest = [{ id: "last-edit", type: "rectangle", version: 11 }];
    h.liveAPI.getSceneElementsIncludingDeleted.mockReturnValue(newest);
    const restore = vi.fn(async () => {});
    await h.persistence.runHistoryRestore("drawing", restore);
    expect(api.updateDrawing).toHaveBeenCalledWith(
      "drawing",
      expect.objectContaining({ elements: newest }),
    );
    await advance(1000);
    expect(api.updateDrawing).toHaveBeenCalledOnce();
    expect(restore).toHaveBeenCalledOnce();
  });

  it("does not restore if the final live backup fails", async () => {
    const h = persistenceHarness();
    await render(<h.Harness />);
    vi.mocked(api.updateDrawing).mockRejectedValueOnce(new Error("offline"));
    const restore = vi.fn(async () => {});
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await expect(
      h.persistence.runHistoryRestore("drawing", restore),
    ).rejects.toThrow("offline");
    expect(restore).not.toHaveBeenCalled();
    expect(h.persistence.historyRestorePendingRef.current).toBe(false);
    consoleError.mockRestore();
  });

  it("resumes saving after a failed restore", async () => {
    const h = persistenceHarness();
    await render(<h.Harness />);
    await expect(
      h.persistence.runHistoryRestore("drawing", async () => {
        throw new Error("conflict");
      }),
    ).rejects.toThrow("conflict");
    expect(h.persistence.historyRestorePendingRef.current).toBe(false);
    await h.persistence.enqueueSceneSave(
      "drawing",
      liveElements,
      liveAppState,
      liveFiles,
    );
    expect(api.updateDrawing).toHaveBeenCalledTimes(2);
  });
});

describe("sharing placement and chrome", () => {
  it("portals the viewport dismiss layer and anchors the fixed popover to the button", async () => {
    const close = vi.fn();
    const anchor = {
      getBoundingClientRect: () => ({ right: 1100, bottom: 48 }),
    };
    const renderer = await render(
      <ShareModal
        drawingId="drawing"
        drawingName="Drawing"
        isOpen
        onClose={close}
        anchorRef={ref(anchor as HTMLElement)}
      />,
    );
    expect(portalTargets).toContain(document.body);
    const dialog = renderer.root.findByProps({ "aria-label": "Share drawing" });
    expect(dialog.props.className).toContain("fixed");
    expect(dialog.props.style).toEqual({ right: 100, top: 56 });
    const backdrop = renderer.root.findAll(
      (node) =>
        node.type === "div" && node.props.className?.includes("fixed inset-0"),
    )[0];
    await act(async () => backdrop.props.onClick());
    expect(close).toHaveBeenCalledOnce();
  });

  it("cancels pending auto-hide timers while sharing is open and resumes after close", async () => {
    let visible = true;
    function Chrome({ open }: { open: boolean }) {
      const chrome = useEditorChrome({
        drawingName: "Drawing",
        autoHideEnabled: true,
        isRenaming: false,
        isShareOpen: open,
      });
      useLayoutEffect(() => {
        visible = chrome.isHeaderVisible;
      });
      return null;
    }
    const renderer = await render(<Chrome open={false} />);
    await advance(2000);
    await act(async () => renderer.update(<Chrome open />));
    await advance(5000);
    expect(visible).toBe(true);
    await act(async () => renderer.update(<Chrome open={false} />));
    await advance(3000);
    expect(visible).toBe(false);
  });

  it("keeps the live canvas mounted and blocks drops from reaching live import handlers during history", async () => {
    const drop = vi.fn();
    const shareAnchor = ref(null);
    const renderer = await render(
      <EditorView
        id="drawing"
        accessLevel="owner"
        canEdit
        autoHideEnabled
        autosaveFailing={false}
        drawingName="Drawing"
        editorContainerRef={ref(null)}
        initialData={{ elements: liveElements }}
        isHeaderVisible={false}
        isHistoryOpen
        historyPreview={historicalSnapshot}
        historyButtonRef={ref(null)}
        shareButtonRef={shareAnchor}
        isRenaming={false}
        isSavingOnLeave={false}
        isSceneLoading={false}
        langCode="en"
        loadError={null}
        me={{ id: "me", name: "Me", color: "red" }}
        newName="Drawing"
        peers={[]}
        theme="light"
        onBackClick={vi.fn()}
        onCanvasChange={vi.fn()}
        onCanvasDropCapture={drop}
        onExportClick={vi.fn()}
        onLibraryChange={vi.fn()}
        onNavigateHome={vi.fn()}
        onNewNameChange={vi.fn()}
        onPointerUpdate={vi.fn()}
        onRenameBlur={vi.fn()}
        onRenameStart={vi.fn()}
        onRenameSubmit={vi.fn()}
        onSetExcalidrawAPI={vi.fn()}
        onSetLangCode={vi.fn()}
        gridStep={20}
        onSetGridStep={vi.fn()}
        onShareOpen={vi.fn()}
        isShareOpen
        onCloseShare={vi.fn()}
        onHistoryOpen={vi.fn()}
        onToggleAutoHide={vi.fn()}
        onToggleTheme={vi.fn()}
      />,
    );
    const canvases = renderer.root.findAllByType(
      "mock-canvas" as React.ElementType,
    );
    expect(canvases).toHaveLength(2);
    expect(canvases[0].props.initialData.elements).toBe(liveElements);
    expect(canvases[1].props.initialData.elements).toBe(
      historicalSnapshot.elements,
    );
    const share = renderer.root.findByType(ShareModal);
    expect(share.props.anchorRef).toBe(shareAnchor);
    expect(share.parent?.type).not.toBe("header");
    expect(renderer.root.findByType("header").props.className).toContain(
      "translate-y-0",
    );
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    renderer.root
      .findAll((node) => node.type === "div" && node.props.onDropCapture)[0]
      .props.onDropCapture(event);
    expect(drop).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });
});

describe("remembering the canvas viewport", () => {
  const props = {
    id: "viewport-drawing",
    me: { id: "viewport-user", name: "User", initials: "U", color: "red" },
    initialData: { elements: [] },
    peers: [],
    theme: "dark",
    langCode: "pt-BR",
    canEdit: false,
    isHistoryOpen: false,
    historyButtonRef: ref(null),
    shareButtonRef: ref(null),
    editorContainerRef: ref(null),
  };

  it("remembers pan and zoom even when the drawing is read-only", async () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    const renderer = await render(<EditorView {...(props as any)} />);
    const canvas = renderer.root.findByType("mock-canvas" as React.ElementType);
    expect(typeof canvas.props.onScrollChange).toBe("function");
    await act(async () =>
      canvas.props.onScrollChange(-1200, 450, { value: 1.5 }),
    );
    await advance(600);
    expect(JSON.parse([...values.values()][0])).toEqual({
      scrollX: -1200,
      scrollY: 450,
      zoom: { value: 1.5 },
    });
  });

  it("flushes the final position on leaving without waiting for a timer", async () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    const renderer = await render(<EditorView {...(props as any)} />);
    const canvas = renderer.root.findByType("mock-canvas" as React.ElementType);
    expect(typeof canvas.props.onScrollChange).toBe("function");
    await act(async () => canvas.props.onScrollChange(0, -90, { value: 0.75 }));
    await act(async () => renderer.unmount());
    expect(JSON.parse([...values.values()][0])).toEqual({
      scrollX: 0,
      scrollY: -90,
      zoom: { value: 0.75 },
    });
  });
});
