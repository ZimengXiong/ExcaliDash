import crypto from "crypto";
import { STYLE_KEYS } from "./opSchemas";
import type { OpError } from "./opSchemas";

// Excalidraw ids are nanoid-style tokens. Any collision-free `[\w-]` string is
// a valid id; we mint one with crypto rather than pulling in a transitive dep.
const ID_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";

export const genId = (): string => {
  const bytes = crypto.randomBytes(21);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += ID_ALPHABET[bytes[i] & 63];
  }
  return out;
};

export const genNonce = (): number => crypto.randomInt(0, 2 ** 31);
export const genSeed = (): number => crypto.randomInt(0, 2 ** 31);

export type ExcalidrawElement = Record<string, any>;

const charWidthFactor = (char: string): number => {
  if (/\s/.test(char)) return 0.33;
  if (/[ilI1.,'`|!]/.test(char)) return 0.3;
  if (/[MW@#%&]/.test(char)) return 0.9;
  if (/[^\u0000-\u00ff]/.test(char)) return 1;
  return 0.56;
};

export const estimateTextWidth = (text: string, fontSize: number): number =>
  [...text].reduce((sum, char) => sum + charWidthFactor(char) * fontSize, 0);

export const wrapText = (
  text: string,
  maxWidth: number,
  fontSize: number,
): string => {
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return text;
  const output: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      output.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const chunks: string[] = [];
      let chunk = "";
      for (const char of [...word]) {
        const candidate = `${chunk}${char}`;
        if (chunk && estimateTextWidth(candidate, fontSize) > maxWidth) {
          chunks.push(chunk);
          chunk = char;
        } else {
          chunk = candidate;
        }
      }
      if (chunk || chunks.length === 0) chunks.push(chunk);

      for (const [index, wordChunk] of chunks.entries()) {
        const candidate = line ? `${line} ${wordChunk}` : wordChunk;
        const chunkContinuesWord = index < chunks.length - 1;
        if (line && estimateTextWidth(candidate, fontSize) > maxWidth) {
          output.push(line);
          line = wordChunk;
        } else {
          line = candidate;
        }
        if (chunkContinuesWord) {
          output.push(line);
          line = "";
        }
      }
    }
    output.push(line);
  }
  return output.join("\n");
};

export const updateTextMetrics = (
  el: ExcalidrawElement,
  options: { maxWidth?: number; center?: { x: number; y: number } } = {},
): void => {
  const fontSize =
    typeof el.fontSize === "number" && el.fontSize > 0 ? el.fontSize : 20;
  const lineHeight =
    typeof el.lineHeight === "number" && el.lineHeight > 0 ? el.lineHeight : 1.25;
  const original = typeof el.originalText === "string" ? el.originalText : el.text ?? "";
  const text = options.maxWidth
    ? wrapText(original, options.maxWidth, fontSize)
    : original;
  const lines = text.split("\n");
  el.text = text;
  el.originalText = original;
  el.width = Math.max(10, ...lines.map((line) => estimateTextWidth(line, fontSize)));
  el.height = Math.max(fontSize * lineHeight, Math.ceil(lines.length * fontSize * lineHeight));
  el.autoResize = options.maxWidth === undefined;
  if (options.center) {
    el.x = options.center.x - el.width / 2;
    el.y = options.center.y - el.height / 2;
  }
};

export const BOUND_TEXT_PADDING = 10;

/**
 * Rewrap and center a bound label, growing the container vertically when the
 * requested height cannot hold the resulting lines. Width remains the caller's
 * layout constraint; long unbroken tokens are split by wrapText().
 */
export const fitBoundTextToContainer = (
  container: ExcalidrawElement,
  label: ExcalidrawElement,
  options: { preserveCenter?: boolean } = {},
): boolean => {
  const before = [
    container.x,
    container.y,
    container.width,
    container.height,
    label.x,
    label.y,
    label.width,
    label.height,
    label.text,
  ];
  const center = centerOf(container);
  const maxWidth = Math.max(
    20,
    (Number(container.width) || 120) - BOUND_TEXT_PADDING * 2,
  );

  updateTextMetrics(label, { maxWidth });
  const minimumHeight = Math.ceil(label.height + BOUND_TEXT_PADDING * 2);
  if ((Number(container.height) || 0) < minimumHeight) {
    container.height = minimumHeight;
    if (options.preserveCenter !== false) {
      container.y = center.cy - minimumHeight / 2;
    }
  }

  const fittedCenter = centerOf(container);
  label.x = fittedCenter.cx - label.width / 2;
  label.y = fittedCenter.cy - label.height / 2;

  return before.some(
    (value, index) =>
      value !==
      [
        container.x,
        container.y,
        container.width,
        container.height,
        label.x,
        label.y,
        label.width,
        label.height,
        label.text,
      ][index],
  );
};

const baseElement = (
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
): ExcalidrawElement => ({
  id: genId(),
  type,
  x,
  y,
  width,
  height,
  angle: 0,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  groupIds: [],
  frameId: null,
  roundness: null,
  seed: genSeed(),
  version: 1,
  versionNonce: genNonce(),
  isDeleted: false,
  boundElements: null,
  updated: Date.now(),
  link: null,
  locked: false,
});

export const createShapeElement = (
  shape: string,
  x: number,
  y: number,
  w: number,
  h: number,
): ExcalidrawElement => {
  const el = baseElement(shape, x, y, w, h);
  if (shape === "frame") {
    el.name = null;
    el.backgroundColor = "transparent";
  }
  return el;
};

export const createTextElement = (
  x: number,
  y: number,
  text: string,
  containerId: string | null = null,
  maxWidth?: number,
): ExcalidrawElement => {
  const fontSize = 20;
  const lineHeight = 1.25;
  // Excalidraw's newTextElement() treats x/y as the alignment anchor and stores
  // the resulting top-left coordinates. Agent ops run on the server and cannot
  // use browser font metrics, but applying the same offset to our estimate is
  // essential: the client can refine an estimated box, whereas it cannot infer
  // that an unshifted x/y was intended to be the center of a bound label.
  const el = baseElement("text", x, y, 10, Math.ceil(fontSize * lineHeight));
  el.text = text;
  el.originalText = text;
  el.fontSize = fontSize;
  el.fontFamily = 1;
  el.textAlign = containerId ? "center" : "left";
  el.verticalAlign = containerId ? "middle" : "top";
  el.containerId = containerId;
  el.lineHeight = lineHeight;
  el.autoResize = true;
  updateTextMetrics(el, {
    maxWidth,
    ...(containerId ? { center: { x, y } } : {}),
  });
  return el;
};

export const createArrowElement = (
  x: number,
  y: number,
  points: [number, number][],
  arrowType: "arrow" | "line",
): ExcalidrawElement => {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const el = baseElement(arrowType, x, y, width, height);
  el.points = points;
  el.lastCommittedPoint = null;
  el.startBinding = null;
  el.endBinding = null;
  el.startArrowhead = null;
  el.endArrowhead = arrowType === "arrow" ? "arrow" : null;
  el.elbowed = false;
  return el;
};

// Bump an element's mutation metadata so collaborators/reconciliation treat it
// as newer than any copy they already hold.
export const touchElement = (el: ExcalidrawElement): void => {
  el.version = (typeof el.version === "number" ? el.version : 0) + 1;
  el.versionNonce = genNonce();
  el.updated = Date.now();
};

// Append a bound-element reference (dedup by id) to an element's boundElements.
export const addBoundElement = (
  el: ExcalidrawElement,
  ref: { id: string; type: string },
): void => {
  const existing = Array.isArray(el.boundElements) ? el.boundElements : [];
  if (existing.some((b: any) => b?.id === ref.id)) return;
  el.boundElements = [...existing, ref];
};

export const removeBoundElement = (el: ExcalidrawElement, id: string): void => {
  if (!Array.isArray(el.boundElements)) return;
  el.boundElements = el.boundElements.filter((b: any) => b?.id !== id);
};

export const centerOf = (el: ExcalidrawElement): { cx: number; cy: number } => ({
  cx: (el.x ?? 0) + (el.width ?? 0) / 2,
  cy: (el.y ?? 0) + (el.height ?? 0) / 2,
});

export const edgePointToward = (
  el: ExcalidrawElement,
  target: { cx: number; cy: number },
): { x: number; y: number } => {
  const { cx, cy } = centerOf(el);
  const dx = target.cx - cx;
  const dy = target.cy - cy;
  const halfW = Math.max(1, (el.width ?? 0) / 2);
  const halfH = Math.max(1, (el.height ?? 0) / 2);
  const scale = 1 / Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH, 1);
  return { x: cx + dx * scale, y: cy + dy * scale };
};

/**
 * Apply a whitelisted style patch in place. Returns an OpError (without
 * opIndex) for the first unknown key so the caller can attach the index.
 */
export const applyStylePatch = (
  el: ExcalidrawElement,
  style: Record<string, unknown>,
): Omit<OpError, "opIndex"> | null => {
  const allowed = new Set<string>(STYLE_KEYS);
  for (const key of Object.keys(style)) {
    if (!allowed.has(key)) {
      return {
        code: "INVALID_STYLE_KEY",
        message: `Unknown style key "${key}"`,
      };
    }
  }
  for (const key of Object.keys(style)) {
    el[key] = style[key];
  }
  return null;
};
