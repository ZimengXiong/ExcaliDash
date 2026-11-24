const MAX_CONTEXT_ELEMENTS = 400;

const finiteOrZero = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const compactElement = (element: any) => {
  const compact: Record<string, unknown> = {
    id: String(element.id),
    type: String(element.type),
    x: finiteOrZero(element.x),
    y: finiteOrZero(element.y),
    width: finiteOrZero(element.width),
    height: finiteOrZero(element.height),
  };
  for (const key of [
    "angle",
    "strokeColor",
    "backgroundColor",
    "fillStyle",
    "strokeWidth",
    "strokeStyle",
    "roughness",
    "opacity",
    "fontSize",
    "containerId",
  ]) {
    if (element[key] !== undefined && element[key] !== null) {
      compact[key] = element[key];
    }
  }
  if (typeof element.text === "string")
    compact.text = element.text.slice(0, 2000);
  if (Array.isArray(element.points)) {
    compact.points = element.points.slice(0, 100);
  }
  if (Array.isArray(element.boundElements)) {
    compact.boundElements = element.boundElements.map((bound: any) => ({
      id: String(bound.id),
      type: String(bound.type),
    }));
  }
  return compact;
};

export const buildBoardContext = (
  name: string,
  elementsInput: unknown,
  appStateInput: unknown,
) => {
  const allElements = Array.isArray(elementsInput)
    ? elementsInput.filter((element) => element && !element.isDeleted)
    : [];
  const elements = allElements
    .slice(0, MAX_CONTEXT_ELEMENTS)
    .map(compactElement);
  const appState =
    appStateInput && typeof appStateInput === "object"
      ? (appStateInput as Record<string, unknown>)
      : {};
  return {
    name,
    viewBackgroundColor: appState.viewBackgroundColor ?? "#ffffff",
    elements,
    truncated: allElements.length > elements.length,
  };
};
