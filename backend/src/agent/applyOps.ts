import { sanitizeElementText } from "../security";
import type { Op, OpError } from "./opSchemas";
import {
  ExcalidrawElement,
  addBoundElement,
  applyStylePatch,
  centerOf,
  createArrowElement,
  createShapeElement,
  createTextElement,
  genId,
  removeBoundElement,
  touchElement,
} from "./elementFactory";

export type ApplyOpsContext = {
  // Pre-loaded snapshot element arrays keyed by version, for revert_to_snapshot
  // (the route fetches DrawingSnapshot rows before the tx).
  snapshotElementsByVersion?: Map<number, ExcalidrawElement[]>;
};

export type ApplyOpsSuccess = {
  ok: true;
  elements: ExcalidrawElement[];
  results: { opIndex: number; createdIds?: string[] }[];
  // Ids created, modified, or tombstoned — the exact set broadcast on the relay.
  changedIds: Set<string>;
  orderChanged: boolean;
};

export type ApplyOpsFailure = { ok: false; errors: OpError[] };

// Working scene: array preserves z-order; map indexes elements by id (both hold
// the same object references, so in-place mutation is visible through either).
class Scene {
  elements: ExcalidrawElement[];
  private byId = new Map<string, ExcalidrawElement>();
  changed = new Set<string>();
  orderChanged = false;

  constructor(elements: ExcalidrawElement[]) {
    this.elements = elements.map((el) => ({ ...el }));
    for (const el of this.elements) {
      if (typeof el.id === "string") this.byId.set(el.id, el);
    }
  }

  get(id: string): ExcalidrawElement | undefined {
    return this.byId.get(id);
  }

  // A tombstoned element behaves as absent for ops that target live geometry.
  getLive(id: string): ExcalidrawElement | undefined {
    const el = this.byId.get(id);
    if (!el || el.isDeleted) return undefined;
    return el;
  }

  add(el: ExcalidrawElement): void {
    this.elements.push(el);
    if (typeof el.id === "string") this.byId.set(el.id, el);
    this.changed.add(el.id);
    this.orderChanged = true;
  }

  markChanged(el: ExcalidrawElement): void {
    touchElement(el);
    this.changed.add(el.id);
  }

  boundLabelOf(container: ExcalidrawElement): ExcalidrawElement | undefined {
    const refs = Array.isArray(container.boundElements)
      ? container.boundElements
      : [];
    for (const ref of refs) {
      if (ref?.type === "text" && typeof ref.id === "string") {
        const label = this.byId.get(ref.id);
        if (label && !label.isDeleted) return label;
      }
    }
    return undefined;
  }
}

const applyAddShape = (scene: Scene, op: Extract<Op, { op: "add_shape" }>) => {
  const w = op.w ?? (op.shape === "text" ? 100 : 120);
  const h = op.h ?? (op.shape === "text" ? 25 : 60);
  const createdIds: string[] = [];

  if (op.shape === "text") {
    const text = sanitizeElementText(op.label ?? "");
    const el = createTextElement(op.x, op.y, text);
    if (op.style) {
      const err = applyStylePatch(el, op.style);
      if (err) return { error: err };
    }
    scene.add(el);
    createdIds.push(el.id);
    return { createdIds };
  }

  const el = createShapeElement(op.shape, op.x, op.y, w, h);
  if (op.style) {
    const err = applyStylePatch(el, op.style);
    if (err) return { error: err };
  }
  scene.add(el);
  createdIds.push(el.id);

  if (op.label !== undefined) {
    const text = sanitizeElementText(op.label);
    const label = createTextElement(op.x + w / 2, op.y + h / 2, text, el.id);
    addBoundElement(el, { id: label.id, type: "text" });
    scene.add(label);
    createdIds.push(label.id);
  }
  return { createdIds };
};

const applyConnect = (scene: Scene, op: Extract<Op, { op: "connect" }>) => {
  const from = scene.getLive(op.fromId);
  if (!from) {
    return { error: notFound(op.fromId) };
  }
  const to = scene.getLive(op.toId);
  if (!to) {
    return { error: notFound(op.toId) };
  }
  const a = centerOf(from);
  const b = centerOf(to);
  const arrow = createArrowElement(
    a.cx,
    a.cy,
    [
      [0, 0],
      [b.cx - a.cx, b.cy - a.cy],
    ],
    op.arrowType ?? "arrow",
  );
  arrow.startBinding = { elementId: from.id, focus: 0, gap: 4 };
  arrow.endBinding = { elementId: to.id, focus: 0, gap: 4 };
  if (op.style) {
    const err = applyStylePatch(arrow, op.style);
    if (err) return { error: err };
  }
  scene.add(arrow);

  addBoundElement(from, { id: arrow.id, type: "arrow" });
  scene.markChanged(from);
  addBoundElement(to, { id: arrow.id, type: "arrow" });
  scene.markChanged(to);

  const createdIds = [arrow.id];
  if (op.label !== undefined) {
    const label = createTextElement(a.cx, a.cy, sanitizeElementText(op.label), arrow.id);
    addBoundElement(arrow, { id: label.id, type: "text" });
    scene.add(label);
    createdIds.push(label.id);
  }
  return { createdIds };
};

const applySetText = (scene: Scene, op: Extract<Op, { op: "set_text" }>) => {
  const el = scene.getLive(op.id);
  if (!el) return { error: notFound(op.id) };
  const text = sanitizeElementText(op.text);

  if (el.type === "text") {
    el.text = text;
    el.originalText = text;
    scene.markChanged(el);
    return {};
  }

  const label = scene.boundLabelOf(el);
  if (label) {
    label.text = text;
    label.originalText = text;
    scene.markChanged(label);
    return {};
  }

  const c = centerOf(el);
  const created = createTextElement(c.cx, c.cy, text, el.id);
  addBoundElement(el, { id: created.id, type: "text" });
  scene.markChanged(el);
  scene.add(created);
  return { createdIds: [created.id] };
};

const applySetStyle = (scene: Scene, op: Extract<Op, { op: "set_style" }>) => {
  const el = scene.getLive(op.id);
  if (!el) return { error: notFound(op.id) };
  const err = applyStylePatch(el, op.style);
  if (err) return { error: err };
  scene.markChanged(el);
  return {};
};

const applyMove = (scene: Scene, op: Extract<Op, { op: "move" }>) => {
  const el = scene.getLive(op.id);
  if (!el) return { error: notFound(op.id) };
  const dx = op.x !== undefined ? op.x - (el.x ?? 0) : op.dx ?? 0;
  const dy = op.y !== undefined ? op.y - (el.y ?? 0) : op.dy ?? 0;

  el.x = (el.x ?? 0) + dx;
  el.y = (el.y ?? 0) + dy;
  scene.markChanged(el);

  // The bound label rides along so the caption stays centered on the shape.
  const label = scene.boundLabelOf(el);
  if (label) {
    label.x = (label.x ?? 0) + dx;
    label.y = (label.y ?? 0) + dy;
    scene.markChanged(label);
  }
  return {};
};

const applyDelete = (scene: Scene, op: Extract<Op, { op: "delete" }>) => {
  const el = scene.getLive(op.id);
  if (!el) return { error: notFound(op.id) };

  el.isDeleted = true;
  scene.markChanged(el);

  const label = scene.boundLabelOf(el);
  if (label) {
    label.isDeleted = true;
    scene.markChanged(label);
  }

  // Detach any arrow bindings that referenced the deleted element and drop it
  // from every element's boundElements list so no dangling refs remain.
  for (const other of scene.elements) {
    if (other.id === el.id || other.isDeleted) continue;
    let touched = false;
    if (other.startBinding?.elementId === el.id) {
      other.startBinding = null;
      touched = true;
    }
    if (other.endBinding?.elementId === el.id) {
      other.endBinding = null;
      touched = true;
    }
    if (Array.isArray(other.boundElements) && other.boundElements.some((b: any) => b?.id === el.id)) {
      removeBoundElement(other, el.id);
      touched = true;
    }
    if (touched) scene.markChanged(other);
  }
  return {};
};

const applyImport = (scene: Scene, op: Extract<Op, { op: "import_elements" }>) => {
  // Insert-only: every incoming id is remapped to a fresh id so an import can
  // never overwrite existing elements, and intra-batch references are rewritten
  // to the new ids.
  const idMap = new Map<string, string>();
  for (const raw of op.elements) {
    if (typeof raw.id === "string") idMap.set(raw.id, genId());
  }
  const remapId = (id: unknown): unknown =>
    typeof id === "string" && idMap.has(id) ? idMap.get(id) : id;

  const createdIds: string[] = [];
  for (const raw of op.elements) {
    const el: ExcalidrawElement = { ...raw };
    el.id = (typeof raw.id === "string" && idMap.get(raw.id)) || genId();
    el.isDeleted = false;
    touchElement(el);
    el.version = 1;
    if (typeof el.containerId === "string") el.containerId = remapId(el.containerId);
    if (typeof el.frameId === "string") el.frameId = remapId(el.frameId);
    if (Array.isArray(el.boundElements)) {
      el.boundElements = el.boundElements.map((b: any) =>
        b && typeof b.id === "string" ? { ...b, id: remapId(b.id) } : b,
      );
    }
    if (el.startBinding?.elementId) {
      el.startBinding = { ...el.startBinding, elementId: remapId(el.startBinding.elementId) };
    }
    if (el.endBinding?.elementId) {
      el.endBinding = { ...el.endBinding, elementId: remapId(el.endBinding.elementId) };
    }
    scene.add(el);
    createdIds.push(el.id);
  }
  return { createdIds };
};

const applyRevert = (
  scene: Scene,
  op: Extract<Op, { op: "revert_to_snapshot" }>,
  ctx: ApplyOpsContext,
) => {
  const snapshot = ctx.snapshotElementsByVersion?.get(op.version);
  if (!snapshot) {
    return {
      error: {
        code: "SNAPSHOT_NOT_FOUND" as const,
        message: `No snapshot at version ${op.version}`,
      },
    };
  }
  const snapById = new Map<string, ExcalidrawElement>();
  for (const el of snapshot) {
    if (typeof el.id === "string") snapById.set(el.id, el);
  }
  // Element-level compensating update: for every id that differs between the
  // snapshot and the current scene, restore the snapshot copy; ids created
  // after the snapshot are tombstoned.
  const touchedIds = new Set<string>([
    ...snapById.keys(),
    ...scene.elements.map((el) => el.id),
  ]);
  for (const id of touchedIds) {
    const snap = snapById.get(id);
    const cur = scene.get(id);
    if (snap && cur) {
      Object.assign(cur, { ...snap });
      scene.markChanged(cur);
    } else if (snap && !cur) {
      const restored = { ...snap };
      scene.add(restored);
    } else if (!snap && cur && !cur.isDeleted) {
      cur.isDeleted = true;
      scene.markChanged(cur);
    }
  }
  return {};
};

const notFound = (elementId: string): Omit<OpError, "opIndex"> => ({
  code: "ELEMENT_NOT_FOUND",
  message: `Element "${elementId}" not found`,
  elementId,
});

type OpResult = { createdIds?: string[]; error?: Omit<OpError, "opIndex"> };

const dispatch = (scene: Scene, op: Op, ctx: ApplyOpsContext): OpResult => {
  switch (op.op) {
    case "add_shape":
      return applyAddShape(scene, op);
    case "connect":
      return applyConnect(scene, op);
    case "set_text":
      return applySetText(scene, op);
    case "set_style":
      return applySetStyle(scene, op);
    case "move":
      return applyMove(scene, op);
    case "delete":
      return applyDelete(scene, op);
    case "import_elements":
      return applyImport(scene, op);
    case "revert_to_snapshot":
      return applyRevert(scene, op, ctx);
    default:
      return { error: { code: "INVALID_OP", message: "Unknown op" } };
  }
};

/**
 * Validate and apply an op batch against a scene in memory. The whole batch is
 * atomic: if any op fails, no partial scene is returned — only the collected
 * errors. All id/seed/versionNonce/binding integrity is owned here.
 */
export const applyOps = (input: {
  ops: Op[];
  elements: ExcalidrawElement[];
  ctx?: ApplyOpsContext;
}): ApplyOpsSuccess | ApplyOpsFailure => {
  const scene = new Scene(input.elements);
  const ctx = input.ctx ?? {};
  const results: { opIndex: number; createdIds?: string[] }[] = [];
  const errors: OpError[] = [];

  input.ops.forEach((op, opIndex) => {
    const out = dispatch(scene, op, ctx);
    if (out.error) {
      errors.push({ ...out.error, opIndex });
      return;
    }
    results.push({ opIndex, createdIds: out.createdIds });
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    elements: scene.elements,
    results,
    changedIds: scene.changed,
    orderChanged: scene.orderChanged,
  };
};
