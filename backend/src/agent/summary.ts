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
  return parts.length ? ` ${parts.join(" ")}` : "";
};

/**
 * One compact line describing a single element:
 *   id type x,y w×h [style digest] "text≤60" ->arrows/bindings
 */
export const elementLine = (el: ExcalidrawElement): string => {
  const text = clampText(el.text);
  return [
    el.id,
    el.type,
    `${num(el.x)},${num(el.y)}`,
    `${num(el.width)}×${num(el.height)}`,
    styleDigest(el),
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
}): string => {
  const live = drawing.elements.filter((el) => el && !el.isDeleted);
  const header = `# drawing "${drawing.name ?? "Untitled"}" v${drawing.version} (${live.length} elements)`;
  const lines = live.map(elementLine);
  return [header, ...lines].join("\n");
};

/**
 * One-line-per-element summary of just the elements a batch touched, returned
 * as summaryDelta so a caller can render what changed without re-reading.
 */
export const summarizeElements = (elements: ExcalidrawElement[]): string[] =>
  elements.map((el) => (el.isDeleted ? `${el.id} deleted` : elementLine(el)));
