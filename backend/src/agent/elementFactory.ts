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
): ExcalidrawElement => {
  const fontSize = 20;
  const lineHeight = 1.25;
  const lines = text.length === 0 ? 1 : text.split("\n").length;
  const width = Math.max(
    10,
    text.split("\n").reduce((m, l) => Math.max(m, l.length), 0) * fontSize * 0.6,
  );
  const height = Math.ceil(fontSize * lineHeight * lines);
  const el = baseElement("text", x, y, width, height);
  el.text = text;
  el.originalText = text;
  el.fontSize = fontSize;
  el.fontFamily = 1;
  el.textAlign = containerId ? "center" : "left";
  el.verticalAlign = containerId ? "middle" : "top";
  el.containerId = containerId;
  el.lineHeight = lineHeight;
  el.autoResize = true;
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
