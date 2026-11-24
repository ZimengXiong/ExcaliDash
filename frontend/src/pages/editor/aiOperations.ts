import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
} from "@excalidraw/excalidraw";
import type { AiBoardOperation } from "../../api";

const toElementSkeleton = (element: Record<string, unknown>) => {
  const skeleton: Record<string, any> = { ...element };
  if (skeleton.type !== "text" && skeleton.text && !skeleton.label) {
    skeleton.label = { text: skeleton.text };
    delete skeleton.text;
  }
  if (
    (skeleton.type === "arrow" || skeleton.type === "line") &&
    !skeleton.points
  ) {
    skeleton.points = [
      [0, 0],
      [skeleton.width ?? 100, skeleton.height ?? 0],
    ];
  }
  return skeleton;
};

export const applyAiOperations = (
  excalidrawAPI: any,
  operations: AiBoardOperation[],
) => {
  if (operations.length === 0) return;
  let elements = [...excalidrawAPI.getSceneElementsIncludingDeleted()];
  const createdIds: string[] = [];
  const now = Date.now();

  for (const operation of operations) {
    if (operation.type === "create") {
      const created = convertToExcalidrawElements(
        operation.elements.map(toElementSkeleton) as any,
        { regenerateIds: false },
      );
      elements.push(...created);
      createdIds.push(...created.map((element) => element.id));
      continue;
    }

    elements = elements.map((element) => {
      if (element.id !== operation.elementId || element.isDeleted) {
        return element;
      }
      if (operation.type === "delete") {
        return {
          ...element,
          isDeleted: true,
          version: (element.version ?? 0) + 1,
          versionNonce: Math.floor(Math.random() * 2 ** 31),
          updated: now,
        };
      }
      return {
        ...element,
        ...operation.changes,
        id: element.id,
        type: element.type,
        version: (element.version ?? 0) + 1,
        versionNonce: Math.floor(Math.random() * 2 ** 31),
        updated: now,
      };
    });
  }

  excalidrawAPI.updateScene({
    elements,
    ...(createdIds.length > 0
      ? {
          appState: {
            selectedElementIds: Object.fromEntries(
              createdIds.map((id) => [id, true]),
            ),
          },
        }
      : {}),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
};
