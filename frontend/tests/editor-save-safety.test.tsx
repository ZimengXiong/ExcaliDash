import React, { useLayoutEffect, useState } from "react";
import ShallowRenderer from "react-test-renderer/shallow";
import { Editor } from "../src/pages/Editor";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../src/api";
import { reloadAndReconcile } from "../src/pages/editor/reconcileSave";
import { useEditorPersistence } from "../src/pages/editor/useEditorPersistence";
import { reconcileElements } from "../src/utils/sync";
const { route } = vi.hoisted(() => ({ route: { id: "drawing" } }));
vi.mock("react-router-dom", () => ({
  useParams: () => route,
  useNavigate: vi.fn(),
  useLocation: vi.fn(),
}));
vi.mock("@excalidraw/excalidraw", () => ({
  exportToSvg: vi.fn(),
  exportToCanvas: vi.fn(),
}));
vi.mock("../src/api", () => ({
  getDrawing: vi.fn(),
  saveDrawing: vi.fn(),
  isAxiosError: (error: any) => Boolean(error.response),
}));
vi.mock("../src/utils/imageCompression", () => ({
  compressExcalidrawFiles: vi.fn(async (files) => ({ files, changed: false })),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
const ref = <T,>(current: T) => ({ current });
const element = (id: string, version = 1, extra = {}) => ({
  id,
  type: "rectangle",
  version,
  versionNonce: version,
  updated: version,
  ...extra,
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};
const appState = { viewBackgroundColor: "#ffffff" };
let renderer: ReactTestRenderer | undefined;
const makeHarness = (initial = [element("local")]) => {
  let live: any[] = initial;
  const editor = {
    getSceneElementsIncludingDeleted: () => live,
    getFiles: () => ({}),
    getAppState: () => appState,
    addFiles: vi.fn(),
    updateScene: vi.fn(({ elements }) => {
      live = elements;
    }),
  };
  const refs = {
    currentDrawingVersion: ref<number | null>(1),
    debouncedSave: ref(null),
    excalidrawAPI: ref<any>(editor),
    isSyncing: ref(false),
    isUnmounting: ref(false),
    localSceneRevision: ref(1),
    savedSceneRevision: ref(0),
    lastPersistedElements: ref<readonly any[]>(initial),
    lastPersistedFiles: ref({}),
    lastSyncedFiles: ref({}),
    latestAppState: ref(appState),
    latestElements: ref<readonly any[]>(initial),
    latestFiles: ref<any>({}),
    saveQueue: ref(Promise.resolve()),
    suspiciousBlankLoad: ref(false),
    uploadedRefs: ref({}),
  };
  let persistence!: ReturnType<typeof useEditorPersistence>;
  function Harness({
    drawingId = "drawing",
    canEdit = true,
  }: {
    drawingId?: string;
    canEdit?: boolean;
  }) {
    const nextPersistence = useEditorPersistence({
      drawingId,
      canEdit,
      refs,
      user: null,
      normalizeImageElementStatus: (elements = []) => elements,
      resolveSafeSnapshot: (snapshot = []) => ({
        snapshot,
        prevented: false,
        staleEmptySnapshot: false,
        staleNonRenderableSnapshot: false,
      }),
    });
    useLayoutEffect(() => {
      persistence = nextPersistence;
    });
    return null;
  }
  return {
    refs,
    editor,
    Harness,
    setLive: (elements: any[]) => {
      live = elements;
      refs.latestElements.current = elements;
      refs.localSceneRevision.current++;
    },
    get persistence() {
      return persistence;
    },
  };
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(api.saveDrawing).mockResolvedValue({ version: 2 } as never);
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.useRealTimers();
});
const mount = async (Harness: React.ComponentType) => {
  await act(async () => {
    renderer = create(<Harness />);
  });
};
describe("conflict reconciliation", () => {
  it("keeps edits and peer additions received while the HTTP read is pending", async () => {
    const h = makeHarness();
    const response = deferred<any>();
    vi.mocked(api.getDrawing).mockReturnValue(response.promise);
    const reconciling = reloadAndReconcile(
      h.refs,
      "drawing",
      [element("local")],
      {},
    );
    h.setLive([element("local", 3), element("arrived-during-read")]);
    response.resolve({ version: 4, elements: [element("remote")], files: {} });
    const merged = await reconciling;
    expect(merged!.elements).toEqual(
      expect.arrayContaining([
        element("local", 3),
        element("arrived-during-read"),
        element("remote"),
      ]),
    );
    expect(h.refs.latestElements.current).toEqual(merged!.elements);
  });
  it("preserves live geometry changed during an HTTP read even when revision metadata is unchanged", async () => {
    const original = element("local", 1, { x: 0 });
    const h = makeHarness([original]);
    const response = deferred<any>();
    vi.mocked(api.getDrawing).mockReturnValue(response.promise);
    const read = reloadAndReconcile(h.refs, "drawing", [original], {});
    const moved = element("local", 1, { x: 100 });
    h.setLive([moved]);
    response.resolve({ version: 2, elements: [original], files: {} });
    expect((await read)!.elements).toEqual([moved]);
  });
  it("keeps a newer deletion tombstone over an old HTTP response", async () => {
    const h = makeHarness();
    vi.mocked(api.getDrawing).mockImplementation(async () => {
      h.setLive([element("local", 3, { isDeleted: true })]);
      return {
        version: 4,
        elements: [element("local", 2)],
        files: {},
      } as never;
    });
    expect(
      (await reloadAndReconcile(h.refs, "drawing", [element("local")], {}))!
        .elements,
    ).toEqual([element("local", 3, { isDeleted: true })]);
  });
});
describe("serialized saves", () => {
  it("rebases a queued pre-conflict scene before using the advanced server version", async () => {
    const h = makeHarness();
    await mount(h.Harness);
    const firstSave = deferred<any>();
    vi.mocked(api.saveDrawing).mockReturnValueOnce(firstSave.promise);
    vi.mocked(api.getDrawing).mockResolvedValue({
      version: 2,
      elements: [element("peer")],
      files: {},
    } as never);
    const first = h.persistence.enqueueSceneSave(
      "drawing",
      [element("local")],
      appState,
      {},
    );
    await act(async () => {});
    h.setLive([element("local", 2)]);
    const second = h.persistence.enqueueSceneSave(
      "drawing",
      [element("local", 2)],
      appState,
      {},
    );
    firstSave.reject({ response: { status: 409 } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
      await first;
      await second;
    });
    expect(api.saveDrawing).toHaveBeenLastCalledWith(
      "drawing",
      expect.objectContaining({
        elements: expect.arrayContaining([
          element("local", 2),
          element("peer"),
        ]),
      }),
    );
  });
  it("finishes the old drawing's newest unsaved edit after direct navigation without borrowing the next drawing's state or permission", async () => {
    const sessions = new Map<string, ReturnType<typeof makeHarness>>();
    function DrawingSession({ id, canEdit }: { id: string; canEdit: boolean }) {
      const [h] = useState(() => makeHarness());
      useLayoutEffect(() => {
        sessions.set(id, h);
      });
      return <h.Harness drawingId={id} canEdit={canEdit} />;
    }
    // Use the actual route component's boundary key: removing it makes this
    // regression reuse A's hook state and lose the queued save on navigation.
    const shallow = new ShallowRenderer();
    route.id = "drawing";
    shallow.render(<Editor />);
    const firstKey = shallow.getRenderOutput().key;
    await act(async () => {
      renderer = create(<DrawingSession key={firstKey} id="drawing" canEdit />);
    });
    const a = sessions.get("drawing")!;
    const response = deferred<any>();
    vi.mocked(api.saveDrawing).mockReturnValueOnce(response.promise);
    const pending = a.persistence.enqueueSceneSave(
      "drawing",
      [element("local")],
      appState,
      {},
    );
    await act(async () => {});
    const finalEdit = [element("local", 5)];
    a.setLive(finalEdit);
    a.persistence.debouncedSave("drawing", finalEdit, appState, {});
    route.id = "other";
    shallow.render(<Editor />);
    await act(async () => {
      renderer!.update(
        <DrawingSession
          key={shallow.getRenderOutput().key}
          id="other"
          canEdit={false}
        />,
      );
    });
    const b = sessions.get("other")!;
    b.setLive([element("other", 10)]);
    b.refs.currentDrawingVersion.current = 10;
    b.refs.lastPersistedElements.current = [element("other", 10)];
    response.resolve({ version: 2 });
    await act(async () => {
      await pending;
      await a.refs.saveQueue.current;
    });
    expect(api.saveDrawing).toHaveBeenLastCalledWith(
      "drawing",
      expect.objectContaining({ elements: finalEdit, version: 2 }),
    );
    expect(
      vi.mocked(api.saveDrawing).mock.calls.every(([id]) => id === "drawing"),
    ).toBe(true);
    expect(b.refs.currentDrawingVersion.current).toBe(10);
    expect(b.refs.lastPersistedElements.current).toEqual([
      element("other", 10),
    ]);
    expect(b.refs.latestElements.current).toEqual([element("other", 10)]);
    expect(b.editor.updateScene).not.toHaveBeenCalled();
  });
  it("does not let an old drawing's response change another drawing's refs", async () => {
    const h = makeHarness();
    await mount(h.Harness);
    const response = deferred<any>();
    vi.mocked(api.saveDrawing).mockReturnValueOnce(response.promise);
    const save = h.persistence.enqueueSceneSave(
      "drawing",
      [element("local")],
      appState,
      {},
    );
    await act(async () => {});
    await act(async () => {
      renderer!.update(<h.Harness drawingId="other" />);
    });
    h.setLive([element("other")]);
    h.refs.currentDrawingVersion.current = 10;
    h.refs.lastPersistedElements.current = [element("other")];
    response.resolve({ version: 2 });
    await act(async () => {
      await save;
    });
    expect(h.refs.currentDrawingVersion.current).toBe(10);
    expect(h.refs.lastPersistedElements.current).toEqual([element("other")]);
    expect(h.editor.updateScene).not.toHaveBeenCalled();
  });
});
describe("concurrent element tie breaking", () => {
  it("converges independently of delivery order for equal version edits with different nonces", () => {
    const a = element("shape", 3, { versionNonce: 10, x: 10 });
    const b = element("shape", 3, { versionNonce: 20, x: 20 });
    expect(reconcileElements([a], [b])).toEqual(reconcileElements([b], [a]));
  });
  it("retains newer geometry when an older equal-version update arrives", () => {
    const newer = element("shape", 3, { updated: 10, x: 10 });
    expect(
      reconcileElements([newer], [element("shape", 3, { updated: 2, x: 2 })]),
    ).toEqual([newer]);
  });
});
