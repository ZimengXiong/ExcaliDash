type RestoreElements = (
  elements: any[],
  localElements: readonly any[] | null,
  options: { repairBindings: boolean; refreshDimensions: boolean },
) => readonly any[];

/**
 * Agent ops are produced outside the browser, so their text width/height is an
 * estimate. Excalidraw normally refreshes those metrics when text editing ends,
 * but updateScene() assumes incoming elements have already been restored.
 *
 * Run the scene through Excalidraw's own restoration path whenever it contains
 * text. Besides measuring standalone text, this also repairs container bindings
 * and centers/wraps bound labels using the container's real geometry.
 */
export const normalizeTextElementDimensions = (
  elements: readonly any[],
  restoreElements: RestoreElements,
): readonly any[] => {
  if (!elements.some((element: any) => element?.type === "text")) {
    return elements;
  }

  try {
    const byId = new Map(
      elements.map((element: any) => [element?.id, element]),
    );
    const anchoredElements = elements.map((element: any) => {
      if (
        element?.type !== "text" ||
        !element.containerId ||
        element.textAlign !== "center" ||
        element.verticalAlign !== "middle" ||
        (element.angle ?? 0) !== 0
      ) {
        return element;
      }
      const container: any = byId.get(element.containerId);
      if (!container || (container.angle ?? 0) !== 0) return element;
      const containerWidth = Number(container.width);
      const containerHeight = Number(container.height);
      const textWidth = Number(element.width);
      const textHeight = Number(element.height);
      if (
        ![containerWidth, containerHeight, textWidth, textHeight].every(
          Number.isFinite,
        )
      ) {
        return element;
      }
      return {
        ...element,
        x: Number(container.x) + (containerWidth - textWidth) / 2,
        y: Number(container.y) + (containerHeight - textHeight) / 2,
      };
    });

    return restoreElements(anchoredElements as any[], null, {
      repairBindings: true,
      refreshDimensions: true,
    });
  } catch (error) {
    // A malformed remote element should not prevent the rest of the batch from
    // rendering. Excalidraw can still accept the unnormalized scene.
    console.warn("[Editor] Unable to refresh remote text dimensions:", error);
    return elements;
  }
};
