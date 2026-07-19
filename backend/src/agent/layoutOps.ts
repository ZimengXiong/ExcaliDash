import type { Op, OpError } from "./opSchemas";
import {
  centerOf,
  genId,
  type ExcalidrawElement,
  updateTextMetrics,
} from "./elementFactory";

export type LayoutScene = {
  getLive: (id: string) => ExcalidrawElement | undefined;
  liveElements: (ids: string[]) => ExcalidrawElement[] | null;
  moveBy: (el: ExcalidrawElement, dx: number, dy: number) => void;
  markChanged: (el: ExcalidrawElement) => void;
  boundLabelOf: (el: ExcalidrawElement) => ExcalidrawElement | undefined;
};

type LayoutOp = Extract<
  Op,
  { op: "resize" | "align" | "distribute" | "layout" | "group" }
>;
type LayoutResult = {
  createdIds?: string[];
  error?: Omit<OpError, "opIndex">;
};

const invalidSet = (message: string): Omit<OpError, "opIndex"> => ({
  code: "INVALID_ELEMENT_SET",
  message,
});

const notFound = (id: string): Omit<OpError, "opIndex"> => ({
  code: "ELEMENT_NOT_FOUND",
  message: `Element "${id}" not found`,
  elementId: id,
});

const resize = (scene: LayoutScene, op: Extract<Op, { op: "resize" }>) => {
  const el = scene.getLive(op.id);
  if (!el) return { error: notFound(op.id) };
  const center = centerOf(el);
  el.width = op.w;
  el.height = op.h;
  el.x = center.cx - op.w / 2;
  el.y = center.cy - op.h / 2;
  scene.markChanged(el);
  const label = scene.boundLabelOf(el);
  if (label) {
    updateTextMetrics(label, {
      maxWidth: Math.max(20, op.w - 20),
      center: { x: center.cx, y: center.cy },
    });
    scene.markChanged(label);
  }
  return {};
};

const align = (scene: LayoutScene, op: Extract<Op, { op: "align" }>) => {
  const elements = scene.liveElements(op.ids);
  if (!elements) return { error: invalidSet("align contains an unknown or deleted id") };
  const bounds = {
    left: Math.min(...elements.map((el) => el.x ?? 0)),
    right: Math.max(...elements.map((el) => (el.x ?? 0) + (el.width ?? 0))),
    top: Math.min(...elements.map((el) => el.y ?? 0)),
    bottom: Math.max(...elements.map((el) => (el.y ?? 0) + (el.height ?? 0))),
  };
  for (const el of elements) {
    let x = el.x ?? 0;
    let y = el.y ?? 0;
    if (op.alignment === "left") x = bounds.left;
    if (op.alignment === "right") x = bounds.right - (el.width ?? 0);
    if (op.alignment === "center") x = (bounds.left + bounds.right - (el.width ?? 0)) / 2;
    if (op.alignment === "top") y = bounds.top;
    if (op.alignment === "bottom") y = bounds.bottom - (el.height ?? 0);
    if (op.alignment === "middle") y = (bounds.top + bounds.bottom - (el.height ?? 0)) / 2;
    scene.moveBy(el, x - (el.x ?? 0), y - (el.y ?? 0));
  }
  return {};
};

const distribute = (
  scene: LayoutScene,
  op: Extract<Op, { op: "distribute" }>,
) => {
  const elements = scene.liveElements(op.ids);
  if (!elements) {
    return { error: invalidSet("distribute contains an unknown or deleted id") };
  }
  const horizontal = op.direction === "horizontal";
  const sorted = [...elements].sort(
    (a, b) => (horizontal ? a.x - b.x : a.y - b.y),
  );
  const start = horizontal ? sorted[0].x : sorted[0].y;
  const sizes = sorted.map((el) => (horizontal ? el.width : el.height) ?? 0);
  const last = sorted[sorted.length - 1];
  const occupied = sizes.reduce((sum, size) => sum + size, 0);
  const span = horizontal
    ? last.x + last.width - start
    : last.y + last.height - start;
  const gap = op.gap ?? Math.max(0, (span - occupied) / (sorted.length - 1));
  let cursor = start;
  sorted.forEach((el, index) => {
    scene.moveBy(
      el,
      horizontal ? cursor - el.x : 0,
      horizontal ? 0 : cursor - el.y,
    );
    cursor += sizes[index] + gap;
  });
  return {};
};

const layout = (scene: LayoutScene, op: Extract<Op, { op: "layout" }>) => {
  const elements = scene.liveElements(op.ids);
  if (!elements) return { error: invalidSet("layout contains an unknown or deleted id") };
  const gap = op.gap ?? 80;
  const originX = op.x ?? Math.min(...elements.map((el) => el.x ?? 0));
  const originY = op.y ?? Math.min(...elements.map((el) => el.y ?? 0));
  const columns =
    op.direction === "grid"
      ? op.columns ?? Math.ceil(Math.sqrt(elements.length))
      : op.direction === "horizontal"
        ? elements.length
        : 1;
  const rows = Math.ceil(elements.length / columns);
  const colWidths = Array.from({ length: columns }, (_, column) =>
    Math.max(...elements.filter((_, i) => i % columns === column).map((el) => el.width ?? 0)),
  );
  const rowHeights = Array.from({ length: rows }, (_, row) =>
    Math.max(...elements.slice(row * columns, (row + 1) * columns).map((el) => el.height ?? 0)),
  );
  const xOffsets = colWidths.map((_, i) =>
    colWidths.slice(0, i).reduce((sum, width) => sum + width + gap, 0),
  );
  const yOffsets = rowHeights.map((_, i) =>
    rowHeights.slice(0, i).reduce((sum, height) => sum + height + gap, 0),
  );
  elements.forEach((el, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    scene.moveBy(el, originX + xOffsets[column] - el.x, originY + yOffsets[row] - el.y);
  });
  return {};
};

const group = (scene: LayoutScene, op: Extract<Op, { op: "group" }>) => {
  const elements = scene.liveElements(op.ids);
  if (!elements) return { error: invalidSet("group contains an unknown or deleted id") };
  const groupId = genId();
  for (const el of elements) {
    el.groupIds = [groupId, ...(Array.isArray(el.groupIds) ? el.groupIds : [])];
    scene.markChanged(el);
    const label = scene.boundLabelOf(el);
    if (label) {
      label.groupIds = [groupId, ...(Array.isArray(label.groupIds) ? label.groupIds : [])];
      scene.markChanged(label);
    }
  }
  return { createdIds: [groupId] };
};

export const applyLayoutOp = (
  scene: LayoutScene,
  op: LayoutOp,
): LayoutResult => {
  switch (op.op) {
    case "resize": return resize(scene, op);
    case "align": return align(scene, op);
    case "distribute": return distribute(scene, op);
    case "layout": return layout(scene, op);
    case "group": return group(scene, op);
  }
};
