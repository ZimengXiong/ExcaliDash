import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../src/api";
import { rehydrateFilesFromUrls } from "../src/utils/rehydrateFiles";
import { getFilesDelta } from "../src/pages/editor/shared";
import { useEditorCanvasHandlers } from "../src/pages/editor/useEditorCanvasHandlers";
import { useEditorCollaboration } from "../src/pages/editor/useEditorCollaboration";
const { sockets } = vi.hoisted(() => ({ sockets: [] as any[] }));
vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { IMMEDIATELY: "IMMEDIATELY", NEVER: "NEVER" },
  getVisibleSceneBounds: vi.fn(() => [0, 0, 100, 50]),
  zoomToFitBounds: vi.fn(() => ({
    appState: { scrollX: -10, scrollY: -20, zoom: { value: 2 } },
  })),
}));
vi.mock("socket.io-client", () => ({
  io: vi.fn(() => {
    const handlers = new Map<string, (...args: any[]) => void>();
    const socket = {
      connected: true,
      handlers,
      ack: undefined as any,
      on: vi.fn((event, handler) => {
        handlers.set(event, handler);
      }),
      off: vi.fn((event) => handlers.delete(event)),
      disconnect: vi.fn(),
      emit: vi.fn((event, _payload, ack) => {
        if (event === "join-room") socket.ack = ack;
      }),
    };
    sockets.push(socket);
    return socket;
  }),
}));
vi.mock("../src/api", () => ({ getDrawing: vi.fn() }));
vi.mock("../src/utils/rehydrateFiles", () => ({
  filesNeedRehydration: (files: any) =>
    Object.values(files).some((file: any) => file.dataURL.startsWith("/api/")),
  rehydrateFilesFromUrls: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn() } }));
const ref = <T,>(current: T) => ({ current });
const element = (id: string, version: number, extra = {}) => ({
  id,
  type: "rectangle",
  version,
  versionNonce: version,
  updated: version,
  ...extra,
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const me = { id: "me", name: "Me", initials: "M", color: "red" };
let renderer: ReactTestRenderer | undefined;
let rafs: Map<number, FrameRequestCallback>;
const flushFrames = async () => {
  await act(async () => {
    const scheduled = [...rafs.values()];
    rafs.clear();
    scheduled.forEach((run) => run(0));
  });
};
const makeHarness = () => {
  let live: any[] = [];
  let appState: any = { collaborators: new Map() };
  const refs = {
    latestElementsRef: ref<readonly any[]>(live),
    latestFilesRef: ref<any>({}),
    lastSyncedFilesRef: ref({}),
    lastSyncedElementOrderSigRef: ref(""),
  };
  const editor = {
    getSceneElementsIncludingDeleted: () => live,
    getAppState: () => appState,
    getFiles: () => ({}),
    addFiles: vi.fn(),
    onUserFollow: vi.fn(() => vi.fn()),
    onScrollChange: vi.fn(() => vi.fn()),
    updateScene: vi.fn((scene) => {
      if (scene.elements) live = scene.elements;
      if (scene.collaborators) {
        appState = { ...appState, collaborators: scene.collaborators };
      }
      if (scene.appState) appState = { ...appState, ...scene.appState };
    }),
  };
  const input = {
    ...refs,
    me,
    isReady: true,
    excalidrawAPI: ref(editor),
    computeElementOrderSig: (els: readonly any[]) =>
      els.map((el) => el.id).join(","),
    recordElementVersion: vi.fn(),
    onAccessDenied: vi.fn(),
  };
  function Harness({ drawingId = "drawing" }: { drawingId?: string }) {
    useEditorCollaboration({ ...input, drawingId });
    return null;
  }
  return {
    refs,
    editor,
    input,
    Harness,
    setAppState: (patch: any) => {
      appState = { ...appState, ...patch };
    },
    setLive: (els: any[]) => {
      live = els;
      refs.latestElementsRef.current = els;
    },
  };
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  sockets.length = 0;
  rafs = new Map();
  let nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => {
    rafs.set(++nextFrame, run);
    return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => rafs.delete(id));
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      location: { origin: "http://example.test", reload: vi.fn() },
      setInterval,
      clearInterval,
    }),
  );
  vi.stubGlobal("document", new EventTarget());
  vi.mocked(api.getDrawing).mockResolvedValue({
    elements: [],
    files: {},
  } as never);
  vi.mocked(rehydrateFilesFromUrls).mockImplementation(
    async (files) => files || {},
  );
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const mount = async (Harness: React.ComponentType) => {
  await act(async () => {
    renderer = create(<Harness />);
  });
};
describe("remote collaboration staging", () => {
  it("keeps the newest delta when an older packet arrives before the animation flush", async () => {
    const h = makeHarness();
    await mount(h.Harness);
    sockets[0].handlers.get("element-update")({
      elements: [element("peer", 3)],
    });
    sockets[0].handlers.get("element-update")({
      elements: [element("peer", 1)],
    });
    await flushFrames();
    expect(h.refs.latestElementsRef.current).toEqual([element("peer", 3)]);
    expect(h.input.recordElementVersion).toHaveBeenCalledWith(
      element("peer", 3),
    );
  });
  it("preserves realtime geometry staged before an equal-metadata persisted echo in the same frame", async () => {
    const h = makeHarness();
    await mount(h.Harness);
    const realtime = element("peer-new", 1, { x: 100 });
    sockets[0].handlers.get("element-update")({ elements: [realtime] });
    sockets[0].handlers.get("element-update")({
      elements: [element("peer-new", 1, { x: 0 })],
      persisted: true,
    });
    await flushFrames();
    expect(h.refs.latestElementsRef.current).toEqual([realtime]);
    expect(h.input.recordElementVersion).toHaveBeenCalledWith(realtime);
  });
  it("preserves realtime geometry staged while HTTP catchup resolves before the same frame", async () => {
    const h = makeHarness();
    await mount(h.Harness);
    const response = deferred<any>();
    vi.mocked(api.getDrawing).mockReturnValueOnce(response.promise);
    sockets[0].ack({ user: me });
    const realtime = element("peer-new", 1, { x: 100 });
    sockets[0].handlers.get("element-update")({ elements: [realtime] });
    await act(async () => {
      response.resolve({
        elements: [element("peer-new", 1, { x: 0 })],
        files: {},
      });
      await response.promise;
    });
    await flushFrames();
    expect(h.refs.latestElementsRef.current).toEqual([realtime]);
    expect(h.input.recordElementVersion).toHaveBeenCalledWith(realtime);
  });
  it("accepts realtime geometry staged after an equal-metadata persisted echo in the same frame", async () => {
    const h = makeHarness();
    await mount(h.Harness);
    sockets[0].handlers.get("element-update")({
      elements: [element("peer-new", 1, { x: 0 })],
      persisted: true,
    });
    const realtime = element("peer-new", 1, { x: 100 });
    sockets[0].handlers.get("element-update")({ elements: [realtime] });
    await flushFrames();
    expect(h.refs.latestElementsRef.current).toEqual([realtime]);
  });
  it.each([
    element("peer-new", 2, { x: 200 }),
    element("peer-new", 1, { versionNonce: 0, x: 200 }),
  ])(
    "accepts a persisted revision winner over a pending realtime element: %j",
    async (persisted) => {
      const h = makeHarness();
      await mount(h.Harness);
      sockets[0].handlers.get("element-update")({
        elements: [element("peer-new", 1, { x: 100 })],
      });
      sockets[0].handlers.get("element-update")({
        elements: [persisted],
        persisted: true,
      });
      await flushFrames();
      expect(h.refs.latestElementsRef.current).toEqual([persisted]);
    },
  );
  it("compares saved image echoes against retained editor bytes so the file poll does not enqueue another save", async () => {
    const h = makeHarness();
    const original = { id: "image", dataURL: "data:image/png;base64,original" };
    let editorFiles: Record<string, any> = { image: original };
    h.editor.getFiles = () => editorFiles;
    h.editor.addFiles.mockImplementation((files: any[]) => {
      // Match Excalidraw.addMissingFiles: an existing content ID keeps its bytes.
      const next = { ...editorFiles };
      files.forEach((file) => {
        if (!next[file.id]) next[file.id] = file;
      });
      editorFiles = next;
    });
    h.refs.lastSyncedFilesRef.current = editorFiles;
    h.refs.latestFilesRef.current = editorFiles;
    const save = vi.fn();
    const fileEmit = vi.fn(
      (files: Record<string, any>) =>
        Object.keys(getFilesDelta(h.refs.lastSyncedFilesRef.current, files))
          .length > 0,
    );
    function PollingHarness() {
      const { isSyncing } = useEditorCollaboration({
        ...h.input,
        drawingId: "drawing",
      });
      useEditorCanvasHandlers({
        canEdit: true,
        drawingId: "drawing",
        isReady: true,
        debouncedSavePreview: vi.fn(),
        emitFilesDeltaIfNeeded: fileEmit,
        refs: {
          excalidrawAPI: h.input.excalidrawAPI,
          isSyncing,
          isUnmounting: ref(false),
          hasHydratedInitialScene: ref(true),
          hasSceneChangesSinceLoad: ref(false),
          initialSceneElements: ref([]),
          isBootstrappingScene: ref(false),
          lastLocalChangeAt: ref(0),
          latestAppState: ref({}),
          latestElements: h.refs.latestElementsRef,
          latestFiles: h.refs.latestFilesRef,
          debouncedSave: ref(save),
          suspiciousBlankLoad: ref(false),
        },
        resolveSafeSnapshot: () => ({
          prevented: false,
          staleEmptySnapshot: false,
          staleNonRenderableSnapshot: false,
        }),
        broadcastChanges: vi.fn(),
      });
      return null;
    }
    await mount(PollingHarness);
    const incoming = {
      image: { ...original, dataURL: "data:image/png;base64,compressed" },
      added: { id: "added", dataURL: "data:image/png;base64,new" },
    };
    sockets[0].handlers.get("element-update")({
      elements: [],
      files: incoming,
      persisted: true,
    });
    await flushFrames();
    expect(editorFiles.image).toEqual(original);
    expect(editorFiles.added).toEqual(incoming.added);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7500);
    });
    expect(fileEmit).toHaveBeenCalledTimes(3);
    expect(save).not.toHaveBeenCalled();
    expect(h.refs.latestFilesRef.current).toEqual(incoming);
    expect(h.refs.lastSyncedFilesRef.current).toEqual(editorFiles);
  });
  it("keeps live equal-metadata geometry over a delayed persisted packet while accepting ordinary realtime frames", async () => {
    const h = makeHarness();
    await mount(h.Harness);
    h.setLive([element("live", 1, { x: 100 })]);
    sockets[0].handlers.get("element-update")({
      elements: [element("live", 1, { x: 0 })],
      persisted: true,
    });
    await flushFrames();
    expect(h.refs.latestElementsRef.current).toEqual([
      element("live", 1, { x: 100 }),
    ]);
    sockets[0].handlers.get("element-update")({
      elements: [element("live", 1, { x: 150 })],
    });
    await flushFrames();
    expect(h.refs.latestElementsRef.current).toEqual([
      element("live", 1, { x: 150 }),
    ]);
  });
  it.each(["persisted", "catchup"])(
    "reuses known inline images across repeated %s snapshots and hydrates new IDs",
    async (source) => {
      const h = makeHarness();
      const known = { id: "image", dataURL: "data:image/png;base64,original" };
      let editorFiles: Record<string, any> = { image: known };
      h.editor.getFiles = () => editorFiles;
      h.editor.addFiles.mockImplementation((files: any[]) => {
        for (const file of files) {
          if (!editorFiles[file.id])
            editorFiles = { ...editorFiles, [file.id]: file };
        }
      });
      h.refs.latestFilesRef.current = editorFiles;
      h.refs.lastSyncedFilesRef.current = editorFiles;
      await mount(h.Harness);
      const deliver = async (files: Record<string, any>) => {
        await act(async () => {
          if (source === "persisted") {
            sockets[0].handlers.get("element-update")({
              elements: [],
              files,
              persisted: true,
            });
          } else {
            vi.mocked(api.getDrawing).mockResolvedValue({
              elements: [],
              files,
            } as never);
            sockets[0].ack({ user: me });
          }
        });
        await flushFrames();
      };
      const knownRef = {
        image: { id: "image", dataURL: "/api/files/drawing/image" },
      };
      for (let i = 0; i < 3; i++) await deliver(knownRef);
      expect(rehydrateFilesFromUrls).not.toHaveBeenCalled();
      const newRef = { id: "added", dataURL: "/api/files/drawing/added" };
      const hydrated = { id: "added", dataURL: "data:image/png;base64,added" };
      vi.mocked(rehydrateFilesFromUrls).mockResolvedValueOnce({
        added: hydrated,
      });
      await deliver({ ...knownRef, added: newRef });
      expect(rehydrateFilesFromUrls).toHaveBeenCalledExactlyOnceWith({
        added: newRef,
      });
      expect(editorFiles).toEqual({ image: known, added: hydrated });
      expect(h.refs.latestFilesRef.current).toEqual({
        image: known,
        added: hydrated,
      });
      expect(h.refs.lastSyncedFilesRef.current).toEqual(editorFiles);
    },
  );
  it("does not acknowledge unrelated unsent local files when applying saved file echoes", async () => {
    const h = makeHarness();
    const local = { id: "local", dataURL: "data:image/png;base64,unsent" };
    const remote = { id: "remote", dataURL: "data:image/png;base64,received" };
    let editorFiles: Record<string, any> = { local };
    h.editor.getFiles = () => editorFiles;
    h.editor.addFiles.mockImplementation((files: any[]) => {
      files.forEach((file) => {
        editorFiles = {
          ...editorFiles,
          [file.id]: editorFiles[file.id] || file,
        };
      });
    });
    h.refs.latestFilesRef.current = editorFiles;
    await mount(h.Harness);
    sockets[0].handlers.get("element-update")({
      elements: [],
      files: { remote },
      persisted: true,
    });
    await flushFrames();
    expect(h.refs.latestFilesRef.current).toEqual({ local, remote });
    expect(h.refs.lastSyncedFilesRef.current).toEqual({ remote });
    expect(
      getFilesDelta(h.refs.lastSyncedFilesRef.current, editorFiles),
    ).toEqual({ local });
  });
  it("does not erase or acknowledge an unsent local reorder when an older persisted order arrives", async () => {
    const h = makeHarness();
    await mount(h.Harness);
    const first = element("first", 1);
    const second = element("second", 1);
    h.input.lastSyncedElementOrderSigRef.current = "first,second";
    h.setLive([second, first]);
    sockets[0].handlers.get("element-update")({
      elements: [first, second],
      elementOrder: ["first", "second"],
      persisted: true,
    });
    await flushFrames();
    expect(h.refs.latestElementsRef.current).toEqual([second, first]);
    expect(h.input.lastSyncedElementOrderSigRef.current).toBe("first,second");
    expect(
      h.input.computeElementOrderSig(h.refs.latestElementsRef.current),
    ).not.toBe(h.input.lastSyncedElementOrderSigRef.current);
    sockets[0].handlers.get("element-update")({
      elements: [],
      elementOrder: ["first", "second"],
    });
    await flushFrames();
    expect(h.refs.latestElementsRef.current).toEqual([first, second]);
  });
  it("ignores an old drawing's delayed image hydration after navigation", async () => {
    const h = makeHarness();
    await mount(h.Harness);
    const files = deferred<any>();
    vi.mocked(rehydrateFilesFromUrls).mockReturnValueOnce(files.promise);
    sockets[0].handlers.get("element-update")({
      elements: [],
      files: { old: { id: "old", dataURL: "/api/files/drawing/old" } },
    });
    await act(async () => {
      renderer!.update(<h.Harness drawingId="other" />);
    });
    await act(async () => {
      files.resolve({ old: { id: "old", dataURL: "data:old" } });
      await files.promise;
    });
    await flushFrames();
    expect(h.refs.latestFilesRef.current).toEqual({});
    expect(h.editor.addFiles).not.toHaveBeenCalled();
  });
  it("keeps newer inline bytes when an earlier hydration finishes later", async () => {
    const h = makeHarness();
    await mount(h.Harness);
    const files = deferred<any>();
    vi.mocked(rehydrateFilesFromUrls).mockReturnValueOnce(files.promise);
    sockets[0].handlers.get("element-update")({
      elements: [],
      files: { image: { id: "image", dataURL: "/api/files/drawing/image" } },
    });
    const newer = { image: { id: "image", dataURL: "data:new" } };
    sockets[0].handlers.get("element-update")({ elements: [], files: newer });
    await flushFrames();
    await act(async () => {
      files.resolve({ image: { id: "image", dataURL: "data:old" } });
      await files.promise;
    });
    await flushFrames();
    expect(h.refs.latestFilesRef.current).toEqual(newer);
  });
  it("catches up missed persisted peer edits on each room join while preserving unsaved local work", async () => {
    const h = makeHarness();
    await mount(h.Harness);
    h.setLive([element("local", 2)]);
    vi.mocked(api.getDrawing).mockResolvedValue({
      elements: [element("peer", 3)],
      files: {},
    } as never);
    await act(async () => {
      sockets[0].ack({ user: me });
    });
    await flushFrames();
    expect(h.refs.latestElementsRef.current).toEqual(
      expect.arrayContaining([element("peer", 3), element("local", 2)]),
    );
    vi.mocked(api.getDrawing).mockResolvedValue({
      elements: [element("peer", 4, { isDeleted: true })],
      files: {},
    } as never);
    sockets[0].handlers.get("connect")();
    await act(async () => {
      sockets[0].ack({ user: me });
    });
    await flushFrames();
    expect(h.refs.latestElementsRef.current).toEqual(
      expect.arrayContaining([
        element("peer", 4, { isDeleted: true }),
        element("local", 2),
      ]),
    );
    expect(api.getDrawing).toHaveBeenCalledTimes(2);
  });
  it("keeps local live geometry and newly received image bytes over a delayed catchup snapshot", async () => {
    const h = makeHarness();
    await mount(h.Harness);
    const response = deferred<any>();
    vi.mocked(api.getDrawing).mockReturnValueOnce(response.promise);
    sockets[0].ack({ user: me });
    h.setLive([element("live", 1, { x: 100 })]);
    const files = { image: { id: "image", dataURL: "data:new" } };
    sockets[0].handlers.get("element-update")({ elements: [], files });
    await flushFrames();
    await act(async () => {
      response.resolve({
        elements: [element("live", 1, { x: 0 })],
        files: { image: { id: "image", dataURL: "data:old" } },
      });
      await response.promise;
    });
    await flushFrames();
    expect(h.refs.latestElementsRef.current).toEqual([
      element("live", 1, { x: 100 }),
    ]);
    expect(h.refs.latestFilesRef.current).toEqual(files);
  });
  it("ignores room catchup reads that finish after switching drawings", async () => {
    const h = makeHarness();
    await mount(h.Harness);
    const response = deferred<any>();
    vi.mocked(api.getDrawing).mockReturnValueOnce(response.promise);
    sockets[0].ack({ user: me });
    await act(async () => {
      renderer!.update(<h.Harness drawingId="other" />);
    });
    await act(async () => {
      response.resolve({ elements: [element("old", 2)], files: {} });
      await response.promise;
    });
    await flushFrames();
    expect(h.refs.latestElementsRef.current).toEqual([]);
  });
});
describe("follow mode", () => {
  const emitted = (socket: any, event: string) =>
    socket.emit.mock.calls
      .filter(([name]: [string]) => name === event)
      .map(([, payload]: [string, any]) => payload);
  it("keys collaborators by person and keeps them as away until their last tab leaves", async () => {
    const h = makeHarness();
    await mount(h.Harness);
    // A cursor alone adds the person, keyed by their user id.
    sockets[0].handlers.get("cursor-move")({
      userId: "user-b",
      username: "B",
      color: "blue",
      pointer: { x: 1, y: 2 },
    });
    await flushFrames();
    const collaborators = () => h.editor.getAppState().collaborators;
    expect([...collaborators().keys()]).toEqual(["user-b"]);
    const tab = (socketId: string, isActive: boolean) => ({
      id: "user-b",
      socketId,
      name: "B",
      isActive,
    });
    // Two tabs of one person stay one entry, active while either tab is.
    await act(async () => {
      sockets[0].handlers.get("presence-update")([
        tab("socket-b1", false),
        tab("socket-b2", true),
      ]);
    });
    expect([...collaborators().keys()]).toEqual(["user-b"]);
    expect(collaborators().get("user-b")).toMatchObject({
      userState: "active",
    });
    // With only the inactive tab left they are away, not gone.
    await act(async () => {
      sockets[0].handlers.get("presence-update")([tab("socket-b1", false)]);
    });
    expect(collaborators().get("user-b")).toMatchObject({
      userState: "away",
    });
    // They are removed once their last tab leaves.
    await act(async () => {
      sockets[0].handlers.get("presence-update")([]);
    });
    expect(collaborators().size).toBe(0);
  });
  it("lists connected peers as followable before their cursor is seen", async () => {
    const h = makeHarness();
    await mount(h.Harness);
    await act(async () => {
      sockets[0].handlers.get("presence-update")([
        {
          id: "user-c",
          socketId: "socket-c",
          name: "C",
          color: "#00ff00",
          isActive: false,
        },
      ]);
    });
    expect(h.editor.getAppState().collaborators.get("user-c")).toEqual({
      username: "C",
      color: { background: "#00ff00", stroke: "#00ff00" },
      id: "user-c",
      userState: "away",
    });
  });
  // Excalidraw calls its follow target socketId; ours is the user id.
  const follow = (h: any, userId: string) =>
    h.setAppState({ userToFollow: { socketId: userId, username: userId } });
  it("applies viewports only from the followed person in this drawing", async () => {
    const h = makeHarness();
    await mount(h.Harness);
    follow(h, "user-b");
    const bounds = [10, 20, 110, 70];
    const handler = sockets[0].handlers.get("visible-bounds");
    // Someone else, and the followed person in another drawing, are ignored.
    handler({ drawingId: "drawing", userId: "user-c", bounds });
    handler({ drawingId: "other", userId: "user-b", bounds });
    expect(h.editor.updateScene).not.toHaveBeenCalled();
    // The followed person's viewport is fitted to ours.
    handler({ drawingId: "drawing", userId: "user-b", bounds });
    expect(h.editor.updateScene).toHaveBeenCalledWith({
      appState: { scrollX: -10, scrollY: -20, zoom: { value: 2 } },
      captureUpdate: "NEVER",
    });
  });
  it("broadcasts its viewport on scroll and when a peer joins, keeping the last scroll of a burst", async () => {
    const h = makeHarness();
    await mount(h.Harness);
    const socket = sockets[0];
    const [[onScrollChange]] = h.editor.onScrollChange.mock.calls as any;
    // The first scroll is sent at once, saying we follow nobody.
    onScrollChange();
    expect(emitted(socket, "visible-bounds")).toEqual([
      { drawingId: "drawing", bounds: [0, 0, 100, 50], following: null },
    ]);
    // A burst of scrolls sends one trailing update after the throttle.
    onScrollChange();
    onScrollChange();
    expect(emitted(socket, "visible-bounds")).toHaveLength(1);
    vi.advanceTimersByTime(50);
    expect(emitted(socket, "visible-bounds")).toHaveLength(2);
    const peer = { id: "user-b", socketId: "socket-b", name: "B" };
    vi.advanceTimersByTime(50);
    // A newcomer gets our viewport without waiting for us to scroll.
    await act(async () => {
      socket.handlers.get("presence-update")([{ ...peer, isActive: true }]);
    });
    expect(emitted(socket, "visible-bounds")).toHaveLength(3);
    vi.advanceTimersByTime(50);
    // A presence change that adds nobody sends nothing.
    await act(async () => {
      socket.handlers.get("presence-update")([{ ...peer, isActive: false }]);
    });
    vi.advanceTimersByTime(50);
    expect(emitted(socket, "visible-bounds")).toHaveLength(3);
  });
  it("stays quiet while following and reports its viewport after unfollowing", async () => {
    const h = makeHarness();
    await mount(h.Harness);
    const socket = sockets[0];
    const userToFollow = { socketId: "user-b", username: "B" };
    h.setAppState({ userToFollow });
    // While following, our scrolls only mirror the leader; nothing is sent.
    const [[onScrollChange]] = h.editor.onScrollChange.mock.calls as any;
    onScrollChange();
    vi.advanceTimersByTime(50);
    expect(emitted(socket, "visible-bounds")).toEqual([]);
    // Unfollowing tells peers where we are now, and that we follow nobody.
    h.setAppState({ userToFollow: null });
    const [[onUserFollow]] = h.editor.onUserFollow.mock.calls as any;
    onUserFollow({ userToFollow, action: "UNFOLLOW" });
    expect(emitted(socket, "visible-bounds")).toHaveLength(1);
  });
  it("jumps to a person's last known viewport when following them", async () => {
    const h = makeHarness();
    await mount(h.Harness);
    // A viewport arriving while we follow nobody is only remembered.
    sockets[0].handlers.get("visible-bounds")({
      drawingId: "drawing",
      userId: "user-b",
      bounds: [10, 20, 110, 70],
    });
    expect(h.editor.updateScene).not.toHaveBeenCalled();
    // Following them applies it straight away.
    follow(h, "user-b");
    const [[onUserFollow]] = h.editor.onUserFollow.mock.calls as any;
    onUserFollow({
      userToFollow: { socketId: "user-b", username: "B" },
      action: "FOLLOW",
    });
    expect(h.editor.updateScene).toHaveBeenCalledWith({
      appState: { scrollX: -10, scrollY: -20, zoom: { value: 2 } },
      captureUpdate: "NEVER",
    });
  });
  it("keeps following a person while any of their tabs remain", async () => {
    const h = makeHarness();
    await mount(h.Harness);
    const tab = (socketId: string) => ({
      id: "user-b",
      socketId,
      name: "B",
      color: "#00ff00",
      isActive: true,
    });
    await act(async () => {
      sockets[0].handlers.get("presence-update")([
        tab("socket-b1"),
        tab("socket-b2"),
      ]);
    });
    follow(h, "user-b");
    // One of their two tabs closes; the person, and so the follow, remain.
    await act(async () => {
      sockets[0].handlers.get("presence-update")([tab("socket-b2")]);
    });
    expect([...h.editor.getAppState().collaborators.keys()]).toEqual([
      "user-b",
    ]);
  });
  it("follows a chain to its leader and re-resolves when the chain changes", async () => {
    const h = makeHarness();
    await mount(h.Harness);
    const handler = sockets[0].handlers.get("visible-bounds");
    const view = (userId: string, following: string | null) =>
      handler({
        drawingId: "drawing",
        userId,
        bounds: [10, 20, 110, 70],
        following,
      });
    // We follow B, who follows A, so B's own viewport is not what we show.
    follow(h, "user-b");
    view("user-b", "user-a");
    expect(h.editor.updateScene).not.toHaveBeenCalled();
    // A leads the chain, so A's viewport is applied.
    view("user-a", null);
    expect(h.editor.updateScene).toHaveBeenCalledTimes(1);
    // Someone outside the chain changes nothing.
    view("user-x", null);
    expect(h.editor.updateScene).toHaveBeenCalledTimes(1);
    // B stops following, so B now leads and B's viewport is applied.
    view("user-b", null);
    expect(h.editor.updateScene).toHaveBeenCalledTimes(2);
    // A and B following each other leaves no leader, so nothing applies.
    view("user-a", "user-b");
    view("user-b", "user-a");
    expect(h.editor.updateScene).toHaveBeenCalledTimes(2);
    // Applying a viewport scrolls us, but a follower never re-broadcasts, so
    // a loop of followers cannot echo messages between each other.
    const [[onScrollChange]] = h.editor.onScrollChange.mock.calls as any;
    onScrollChange();
    vi.advanceTimersByTime(50);
    expect(emitted(sockets[0], "visible-bounds")).toEqual([]);
  });
});
