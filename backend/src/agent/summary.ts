import type { ExcalidrawElement } from "./elementFactory";

// Round to at most 2 decimals without trailing zeros, for compact geometry.
const num = (v: unknown): string => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return String(Math.round(n * 100) / 100);
};

const clampText = (text: unknown, max = 60): string => {
  if (typeof text !== "string" || text.length === 0) return "";
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
};

// A short digest of the visual style so the model can reason about appearance
// without the full element payload.
const styleDigest = (el: ExcalidrawElement): string => {
  const parts: string[] = [];
  if (el.strokeColor && el.strokeColor !== "#1e1e1e") parts.push(`stroke=${el.strokeColor}`);
  if (el.backgroundColor && el.backgroundColor !== "transparent") parts.push(`bg=${el.backgroundColor}`);
  if (typeof el.strokeWidth === "number" && el.strokeWidth !== 2) parts.push(`w=${el.strokeWidth}`);
  if (typeof el.opacity === "number" && el.opacity !== 100) parts.push(`op=${el.opacity}`);
  return parts.length ? `[${parts.join(" ")}]` : "";
};

const bindingSuffix = (el: ExcalidrawElement): string => {
  const parts: string[] = [];
  if (el.startBinding?.elementId || el.endBinding?.elementId) {
    parts.push(`${el.startBinding?.elementId ?? "?"}->${el.endBinding?.elementId ?? "?"}`);
  }
  if (typeof el.containerId === "string" && el.containerId.length > 0) {
    parts.push(`in:${el.containerId}`);
  }
  if (typeof el.frameId === "string" && el.frameId.length > 0) {
    parts.push(`frame:${el.frameId}`);
  }
  if (Array.isArray(el.groupIds) && el.groupIds.length > 0) {
    parts.push(`groups:${el.groupIds.join(",")}`);
  }
  return parts.length ? ` ${parts.join(" ")}` : "";
};

/**
 * One compact line describing a single element:
 *   id type x,y w×h [style digest] "text≤60" ->arrows/bindings
 */
export const elementLine = (el: ExcalidrawElement): string => {
  const text = clampText(el.text);
  const frameTitle = el.type === "frame" ? clampText(el.name) : "";
  return [
    el.id,
    el.type,
    `${num(el.x)},${num(el.y)}`,
    `${num(el.width)}×${num(el.height)}`,
    styleDigest(el),
    el.type === "frame"
      ? frameTitle
        ? `title="${frameTitle}"`
        : "title=<untitled>"
      : "",
    text ? `"${text}"` : "",
    bindingSuffix(el),
  ]
    .filter((s) => s.length > 0)
    .join(" ");
};

/**
 * The structural read-path summary: a header line (name, version, count) plus
 * one line per non-deleted element in z-order. Plain text so it drops straight
 * into an LLM system prompt.
 */
export const buildStructuralSummary = (drawing: {
  name?: string | null;
  version: number;
  elements: ExcalidrawElement[];
  appState?: Record<string, unknown>;
}): string => {
  const live = drawing.elements.filter((el) => el && !el.isDeleted);
  const header = `# drawing "${drawing.name ?? "Untitled"}" v${drawing.version} (${live.length} elements)`;
  if (live.length === 0) {
    return [
      header,
      "scene bounds: empty; start near (0,0), use 120×60 minimum labeled shapes and 60-100px gaps",
    ].join("\n");
  }
  const minX = Math.min(...live.map((el) => Number(el.x) || 0));
  const minY = Math.min(...live.map((el) => Number(el.y) || 0));
  const maxX = Math.max(
    ...live.map((el) => (Number(el.x) || 0) + (Number(el.width) || 0)),
  );
  const maxY = Math.max(
    ...live.map((el) => (Number(el.y) || 0) + (Number(el.height) || 0)),
  );
  const counts = new Map<string, number>();
  for (const el of live) counts.set(el.type, (counts.get(el.type) ?? 0) + 1);
  const scene = [
    `scene bounds: (${num(minX)},${num(minY)})→(${num(maxX)},${num(maxY)}) ${num(maxX - minX)}×${num(maxY - minY)}`,
    `types: ${[...counts.entries()].map(([type, count]) => `${type}=${count}`).join(" ")}`,
  ];
  const appState = drawing.appState ?? {};
  const zoom = (appState.zoom as { value?: unknown } | undefined)?.value;
  if (
    typeof appState.scrollX === "number" ||
    typeof appState.scrollY === "number" ||
    typeof zoom === "number"
  ) {
    scene.push(
      `viewport: scroll=(${num(appState.scrollX)},${num(appState.scrollY)}) zoom=${num(zoom ?? 1)}`,
    );
  }
  const groupMap = new Map<string, string[]>();
  for (const el of live) {
    for (const groupId of Array.isArray(el.groupIds) ? el.groupIds : []) {
      groupMap.set(groupId, [...(groupMap.get(groupId) ?? []), el.id]);
    }
  }
  if (groupMap.size > 0) {
    scene.push(
      `groups: ${[...groupMap].map(([id, ids]) => `${id}=[${ids.join(",")}]`).join(" ")}`,
    );
  }
  const visual = live.filter(
    (el) =>
      !["arrow", "line", "freedraw"].includes(el.type) &&
      typeof el.containerId !== "string" &&
      (Number(el.width) || 0) > 0 &&
      (Number(el.height) || 0) > 0,
  );
  const overlaps: string[] = [];
  for (let i = 0; i < visual.length && overlaps.length < 10; i += 1) {
    for (let j = i + 1; j < visual.length && overlaps.length < 10; j += 1) {
      const a = visual[i];
      const b = visual[j];
      if (a.type === "frame" || b.type === "frame") continue;
      const overlapW = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapH = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (overlapW > 4 && overlapH > 4) overlaps.push(`${a.id}↔${b.id}`);
    }
  }
  if (overlaps.length > 0) scene.push(`warnings: overlaps ${overlaps.join(" ")}`);
  const byId = new Map(live.map((el) => [el.id, el]));
  const overflowingLabels = live
    .filter((el) => el.type === "text" && typeof el.containerId === "string")
    .filter((label) => {
      const container = byId.get(label.containerId);
      if (!container || container.type === "arrow" || container.type === "line") {
        return false;
      }
      const tolerance = 1;
      return (
        label.x < container.x - tolerance ||
        label.y < container.y - tolerance ||
        label.x + label.width > container.x + container.width + tolerance ||
        label.y + label.height > container.y + container.height + tolerance
      );
    })
    .slice(0, 10)
    .map((label) => `${label.containerId}→${label.id}`);
  if (overflowingLabels.length > 0) {
    scene.push(`warnings: label-overflow ${overflowingLabels.join(" ")}`);
  }
  return [header, ...scene, "elements (z-order):", ...live.map(elementLine)].join("\n");
};

/**
 * One-line-per-element summary of just the elements a batch touched, returned
 * as summaryDelta so a caller can render what changed without re-reading.
 */
export const summarizeElements = (elements: ExcalidrawElement[]): string[] =>
  elements.map((el) => (el.isDeleted ? `${el.id} deleted` : elementLine(el)));
