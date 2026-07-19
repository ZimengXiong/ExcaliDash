import { sanitizeElementText } from "../security";
import type { Op, OpError } from "./opSchemas";
import { resolveBatchRefs } from "./batchRefs";
import {
  ExcalidrawElement,
  addBoundElement,
  applyStylePatch,
  centerOf,
  createArrowElement,
  createShapeElement,
  createTextElement,
  edgePointToward,
  fitBoundTextToContainer,
  genId,
  removeBoundElement,
  touchElement,
  updateTextMetrics,
} from "./elementFactory";
import { applyLayoutOp } from "./layoutOps";
import { Scene } from "./scene";

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

const applyAddShape = (scene: Scene, op: Extract<Op, { op: "add_shape" }>) => {
  const w = op.w ?? (op.shape === "text" ? 100 : 120);
  const h = op.h ?? (op.shape === "text" ? 25 : 60);
  const createdIds: string[] = [];

  if (op.shape === "text") {
    const text = sanitizeElementText(op.label ?? "");
    const el = createTextElement(op.x, op.y, text, null, op.w);
    if (op.style) {
      const err = applyStylePatch(el, op.style);
      if (err) return { error: err };
      updateTextMetrics(el, { maxWidth: op.w });
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
    if (op.shape === "frame") { el.name = text || null; return { createdIds }; }
    const label = createTextElement(
      op.x + w / 2,
      op.y + h / 2,
      text,
      el.id,
      Math.max(20, w - 20),
    );
    fitBoundTextToContainer(el, label, { preserveCenter: false });
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
  const start = edgePointToward(from, b);
  const end = edgePointToward(to, a);
  const arrow = createArrowElement(
    start.x,
    start.y,
    [
      [0, 0],
      [end.x - start.x, end.y - start.y],
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
    const label = createTextElement(
      (start.x + end.x) / 2,
      (start.y + end.y) / 2,
      sanitizeElementText(op.label),
      arrow.id,
    );
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

  if (el.type === "frame") {
    el.name = text || null; scene.markChanged(el); return {};
  }

  if (el.type === "text") {
    el.text = text;
    el.originalText = text;
    const container = el.containerId ? scene.getLive(el.containerId) : null;
    if (container) {
      if (fitBoundTextToContainer(container, el)) scene.markChanged(container);
    } else {
      updateTextMetrics(el);
    }
    scene.markChanged(el);
    return {};
  }

  const label = scene.boundLabelOf(el);
  if (label) {
    label.text = text;
    label.originalText = text;
    fitBoundTextToContainer(el, label);
    scene.markChanged(el);
    scene.markChanged(label);
    return {};
  }

  const c = centerOf(el);
  const created = createTextElement(
    c.cx,
    c.cy,
    text,
    el.id,
    Math.max(20, (el.width ?? 120) - 20),
  );
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
  if (el.type === "text") {
    const container = el.containerId ? scene.getLive(el.containerId) : null;
    if (container) {
      if (fitBoundTextToContainer(container, el)) scene.markChanged(container);
    } else {
      updateTextMetrics(el);
    }
  }
  scene.markChanged(el);
  return {};
};

const applyMove = (scene: Scene, op: Extract<Op, { op: "move" }>) => {
  const el = scene.getLive(op.id);
  if (!el) return { error: notFound(op.id) };
  const dx = op.x !== undefined ? op.x - (el.x ?? 0) : op.dx ?? 0;
  const dy = op.y !== undefined ? op.y - (el.y ?? 0) : op.dy ?? 0;

  scene.moveBy(el, dx, dy);
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
    case "resize":
      return applyLayoutOp(scene, op);
    case "align":
      return applyLayoutOp(scene, op);
    case "distribute":
      return applyLayoutOp(scene, op);
    case "layout":
      return applyLayoutOp(scene, op);
    case "group":
      return applyLayoutOp(scene, op);
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
  const refs = new Map<string, string>();

  input.ops.forEach((op, opIndex) => {
    const raw = op as Op & { ref?: string };
    const resolved = resolveBatchRefs(raw, opIndex, refs);
    if ("error" in resolved) {
      errors.push(resolved.error);
      return;
    }
    const out = dispatch(scene, resolved.op, ctx);
    if (out.error) {
      errors.push({ ...out.error, opIndex });
      return;
    }
    if (raw.ref && out.createdIds?.[0]) refs.set(raw.ref, out.createdIds[0]);
    results.push({ opIndex, createdIds: out.createdIds });
  });

  if (errors.length > 0) return { ok: false, errors };
  scene.rerouteBindings();
  return { ok: true, elements: scene.elements, results,
    changedIds: scene.changed, orderChanged: scene.orderChanged };
};
