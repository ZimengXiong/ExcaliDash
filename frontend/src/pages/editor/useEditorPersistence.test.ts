import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useEditorPersistence } from "./useEditorPersistence";
import * as api from "../../api";
import { compressExcalidrawFiles } from "../../utils/imageCompression";

vi.mock("../../api", () => ({
  updateDrawing: vi.fn(),
  updateLibrary: vi.fn(),
  isAxiosError: vi.fn().mockReturnValue(false),
}));

vi.mock("../../utils/imageCompression", () => ({
  compressExcalidrawFiles: vi.fn(),
}));

vi.mock("@excalidraw/excalidraw", () => ({
  exportToSvg: vi.fn(),
}));

const ref = <T,>(current: T) => ({ current });

describe("useEditorPersistence", () => {
  it("keeps the editor file map as the sync baseline after compression", async () => {
    const editorFiles = {
      image: { id: "image", dataURL: "data:image/png;base64,original" },
    };
    const compressedFiles = {
      image: { id: "image", dataURL: "data:image/webp;base64,compressed" },
    };
    vi.mocked(compressExcalidrawFiles).mockResolvedValue({
      files: compressedFiles,
      changed: true,
      changedIds: ["image"],
    });
    vi.mocked(api.updateDrawing).mockResolvedValue({
      version: 2,
      files: compressedFiles,
    } as any);

    const refs = {
      currentDrawingVersion: ref<number | null>(1),
      debouncedSave: ref<any>(null),
      excalidrawAPI: ref({ addFiles: vi.fn() }),
      isSyncing: ref(false),
      isUnmounting: ref(false),
      lastLocalChangeAt: ref(0),
      lastPersistedElements: ref<readonly any[]>([]),
      lastPersistedFiles: ref<Record<string, any>>({}),
      lastSyncedFiles: ref<Record<string, any>>({}),
      latestAppState: ref<any>(null),
      latestElements: ref<readonly any[]>([]),
      latestFiles: ref<any>(editorFiles),
      saveQueue: ref(Promise.resolve()),
      suspiciousBlankLoad: ref(false),
    };

    const { result } = renderHook(() =>
      useEditorPersistence({
        refs,
        user: null,
        normalizeImageElementStatus: (elements) => elements || [],
        resolveSafeSnapshot: (elements) => ({
          snapshot: elements || [],
          prevented: false,
          staleEmptySnapshot: false,
          staleNonRenderableSnapshot: false,
        }),
      }),
    );

    await act(async () => {
      await result.current.saveDataRef.current?.(
        "drawing",
        [{ id: "element", type: "image", fileId: "image" }],
        {},
        editorFiles,
      );
    });

    expect(api.updateDrawing).toHaveBeenCalledWith(
      "drawing",
      expect.objectContaining({ files: compressedFiles }),
    );
    expect(refs.latestFiles.current).toBe(compressedFiles);
    expect(refs.lastSyncedFiles.current).toBe(editorFiles);
  });
});
