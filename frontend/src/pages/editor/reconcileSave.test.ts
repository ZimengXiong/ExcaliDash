import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { reloadAndReconcile } from "./reconcileSave";

vi.mock("../../api", () => ({
  getDrawing: vi.fn(),
}));

const makeRefs = () => ({
  currentDrawingVersion: { current: 1 as number | null },
  excalidrawAPI: { current: null as any },
  isSyncing: { current: false },
  latestElements: { current: [] as readonly any[] },
  latestFiles: { current: {} as any },
  lastSyncedFiles: { current: {} as Record<string, any> },
});

describe("reloadAndReconcile (409 conflict recovery)", () => {
  const getDrawing = vi.mocked(api.getDrawing);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("merges local and remote elements and unions files instead of clobbering", async () => {
    // Remote gained element R (from another client) and file remote-file.
    getDrawing.mockResolvedValue({
      version: 9,
      elements: [{ id: "R", version: 5 }],
      files: { "remote-file": { id: "remote-file", dataURL: "data:,R" } },
    } as any);

    const refs = makeRefs();
    const localElements = [{ id: "L", version: 3 }];
    const localFiles = { "local-file": { id: "local-file", dataURL: "data:,L" } };

    const result = await reloadAndReconcile(refs, "d1", localElements, localFiles);

    // Both the local and remote elements survive the merge.
    expect(result.elements.map((e: any) => e.id).sort()).toEqual(["L", "R"]);
    // Files are unioned, not replaced.
    expect(Object.keys(result.files).sort()).toEqual([
      "local-file",
      "remote-file",
    ]);
    // Adopts the authoritative server version.
    expect(refs.currentDrawingVersion.current).toBe(9);
    // Refs are updated so the retry builds on the merged state.
    expect(refs.latestElements.current).toBe(result.elements);
    expect(refs.latestFiles.current).toBe(result.files);
    expect(refs.lastSyncedFiles.current).toBe(result.files);
  });

  it("pushes the merged scene into the live editor under the sync guard", async () => {
    getDrawing.mockResolvedValue({
      version: 2,
      elements: [{ id: "R", version: 1 }],
      files: {},
    } as any);

    const updateScene = vi.fn();
    const addFiles = vi.fn();
    const refs = makeRefs();
    refs.excalidrawAPI.current = { updateScene, addFiles };

    await reloadAndReconcile(refs, "d1", [{ id: "L", version: 1 }], {
      f1: { id: "f1", dataURL: "data:,L" },
    });

    expect(addFiles).toHaveBeenCalledTimes(1);
    expect(updateScene).toHaveBeenCalledTimes(1);
    const scene = updateScene.mock.calls[0][0];
    expect(scene.elements.map((e: any) => e.id).sort()).toEqual(["L", "R"]);
    // isSyncing is toggled back off so the editor onChange isn't treated as a
    // user edit.
    expect(refs.isSyncing.current).toBe(false);
  });
});
