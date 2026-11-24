import { describe, expect, it, vi } from "vitest";
import { applyAiOperations } from "../src/pages/editor/aiOperations";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";

vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { IMMEDIATELY: "IMMEDIATELY" },
  convertToExcalidrawElements: vi.fn(() => [
    { id: "created", type: "rectangle", version: 1 },
  ]),
}));

describe("AI board operations", () => {
  it("creates, updates, and tombstones elements in one captured scene update", () => {
    const existing = {
      id: "existing",
      type: "rectangle",
      version: 3,
      isDeleted: false,
    };
    const removed = {
      id: "removed",
      type: "text",
      version: 2,
      isDeleted: false,
    };
    const editor = {
      getSceneElementsIncludingDeleted: vi.fn(() => [existing, removed]),
      updateScene: vi.fn(),
    };

    applyAiOperations(editor, [
      { type: "update", elementId: "existing", changes: { x: 300 } },
      { type: "delete", elementId: "removed" },
      {
        type: "create",
        elements: [{ type: "rectangle", x: 0, y: 0 }],
      },
    ]);

    expect(convertToExcalidrawElements).toHaveBeenCalledWith(
      [{ type: "rectangle", x: 0, y: 0 }],
      { regenerateIds: false },
    );
    const update = editor.updateScene.mock.calls[0][0];
    expect(update.captureUpdate).toBe("IMMEDIATELY");
    expect(update.elements).toHaveLength(3);
    expect(update.elements[0]).toMatchObject({
      id: "existing",
      x: 300,
      version: 4,
    });
    expect(update.elements[1]).toMatchObject({
      id: "removed",
      isDeleted: true,
      version: 3,
    });
    expect(update.elements[2].id).toBe("created");
    expect(update.appState.selectedElementIds).toEqual({ created: true });
  });
});
