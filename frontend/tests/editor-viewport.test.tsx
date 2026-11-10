import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEditorSceneLoader } from "../src/pages/editor/useEditorSceneLoader";
import { readViewport } from "../src/pages/editor/viewport";

vi.mock("../src/api", () => ({
  getDrawing: async () => ({
    name: "Drawing",
    elements: [],
    files: {},
    accessLevel: "owner",
    appState: { viewBackgroundColor: "#123456" },
  }),
  getLibrary: async () => [],
}));
vi.mock("../src/utils/rehydrateFiles", () => ({
  rehydrateFilesProgressive: async () => {},
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

const load = async (raw: string | null) => {
  vi.stubGlobal("localStorage", { getItem: () => raw });
  const ref = (current: any) => ({ current });
  const refs: any = Object.fromEntries(
    [
      "saveQueue",
      "latestElements",
      "initialSceneElements",
      "latestFiles",
      "isSyncing",
      "lastSyncedFiles",
      "lastSyncedElementOrderSig",
      "lastPersistedFiles",
      "currentDrawingVersion",
      "lastPersistedElements",
      "suspiciousBlankLoad",
      "hasSceneChangesSinceLoad",
      "excalidrawAPI",
      "latestAppState",
      "isBootstrappingScene",
      "hasHydratedInitialScene",
    ].map((key) => [key, ref(null)]),
  );
  refs.elementVersionMap = ref(new Map());
  let initialData: any;
  const params = {
    id: "drawing",
    user: { id: "user" },
    viewportUserId: "user",
    location: { pathname: "/editor/drawing", search: "", hash: "" },
    navigate: vi.fn(),
    refs,
    setAccessLevel: vi.fn(),
    setDrawingName: vi.fn(),
    setInitialData: (data: any) => {
      initialData = data;
    },
    setIsReady: vi.fn(),
    setIsSceneLoading: vi.fn(),
    setLoadError: vi.fn(),
    recordElementVersion: vi.fn(),
    normalizeImageElementStatus: (elements: readonly any[] = []) => elements,
  };
  function Harness() {
    useEditorSceneLoader(params);
    return null;
  }
  await act(async () => {
    renderer = create(<Harness />);
  });
  return initialData;
};

describe("restoring the canvas viewport", () => {
  it("opens at the remembered position and zoom instead of reframing the scene", async () => {
    const data = await load(
      '{"scrollX":-1200,"scrollY":450,"zoom":{"value":1.5}}',
    );
    expect(data.appState).toMatchObject({
      scrollX: -1200,
      scrollY: 450,
      zoom: { value: 1.5 },
      viewBackgroundColor: "#123456",
    });
    expect(data.scrollToContent).toBe(false);
  });

  it.each([
    null,
    "{broken",
    "null",
    '{"scrollX":0,"scrollY":0,"zoom":{"value":0}}',
  ])(
    "frames the scene when saved state is absent or invalid: %s",
    async (raw) => {
      const data = await load(raw);
      expect(data.scrollToContent).toBe(true);
      expect(data.appState).not.toHaveProperty("scrollX");
    },
  );

  it("keeps each user's position separate for each drawing", () => {
    const values = new Map([
      [
        'excalidash:viewport:["alice","drawing"]',
        '{"scrollX":10,"scrollY":20,"zoom":{"value":2}}',
      ],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
    });
    expect(readViewport("alice", "drawing")?.zoom.value).toBe(2);
    expect(readViewport("bob", "drawing")).toBeNull();
    expect(readViewport("alice", "other-drawing")).toBeNull();
  });

  it("still opens the drawing when browser storage is blocked", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readViewport("user", "drawing")).toBeNull();
  });
});
