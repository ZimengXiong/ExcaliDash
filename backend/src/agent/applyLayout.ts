import { sanitizeElementText } from "../security";
import {
  ExcalidrawElement,
  addBoundElement,
  applyStylePatch,
  createArrowElement,
  createShapeElement,
  createTextElement,
  validateStylePatch,
} from "./elementFactory";
import { layoutGraphSync } from "./layout";
import type { LayoutResult } from "./layout";
import type { Op, OpError } from "./opSchemas";

/**
 * The subset of the working scene the layout applier needs. Declared here rather
 * than importing the Scene class so the two modules stay decoupled.
 */
export type LayoutScene = {
  add(el: ExcalidrawElement): void;
  markChanged(el: ExcalidrawElement): void;
};

type ApplyLayoutResult = {
  createdIds?: string[];
  error?: Omit<OpError, "opIndex">;
};

/** The layout input for an op, so the route and the applier derive it identically. */
export const layoutInputFor = (op: Extract<Op, { op: "layout" }>) => ({
  nodes: op.nodes.map((node) => ({
    key: node.key,
    label: node.label,
    shape: node.shape,
  })),
  edges: (op.edges ?? []).map((edge) => ({
    from: edge.from,
    to: edge.to,
    label: edge.label,
  })),
  direction: op.direction,
  originX: op.x,
  originY: op.y,
});

/** Reposition an already-measured element so its centre lands on (cx, cy). */
const centreOn = (el: ExcalidrawElement, cx: number, cy: number): void => {
  el.x = Math.round(cx - (el.width ?? 0) / 2);
  el.y = Math.round(cy - (el.height ?? 0) / 2);
};

/**
 * Everything that can be rejected without laying anything out.
 *
 * Kept separate so the route can run it before the solve. A duplicate key or a
 * misspelled style used to be found only after the graph had been solved, so a
 * request that was never going to be applied still cost seconds of worker time.
 */
export const validateLayoutOp = (
  op: Extract<Op, { op: "layout" }>,
): Omit<OpError, "opIndex"> | null => {
  const keys = new Set<string>();
  for (const node of op.nodes) {
    if (keys.has(node.key)) {
      return { code: "INVALID_OP", message: `Duplicate node key "${node.key}"` };
    }
    keys.add(node.key);
    if (node.style) {
      const invalid = validateStylePatch(node.style);
      if (invalid) return invalid;
    }
  }

  for (const edge of op.edges ?? []) {
    const missing = !keys.has(edge.from) ? edge.from : !keys.has(edge.to) ? edge.to : null;
    if (missing) {
      return {
        code: "INVALID_OP",
        message: `Edge references unknown node key "${missing}"`,
      };
    }
    if (edge.style) {
      const invalid = validateStylePatch(edge.style);
      if (invalid) return invalid;
    }
  }
  return null;
};

/**
 * Draw a whole graph from structure alone: dagre derives the geometry, then the
 * shapes, labels and arrows are created through the normal factory so ids,
 * bindings and z-order behave exactly as they do for hand-placed ops.
 */
export const applyLayout = (
  scene: LayoutScene,
  op: Extract<Op, { op: "layout" }>,
  // Geometry solved ahead of the transaction, if the route precomputed it.
  // Without it the solver runs inline here, which is what direct callers get.
  precomputed?: LayoutResult,
): ApplyLayoutResult => {
  const invalid = validateLayoutOp(op);
  if (invalid) return { error: invalid };

  const nodesByKey = new Map<string, (typeof op.nodes)[number]>();
  for (const node of op.nodes) nodesByKey.set(node.key, node);
  const edges = op.edges ?? [];

  const result = precomputed ?? layoutGraphSync(layoutInputFor(op));

  const createdIds: string[] = [];
  const elementByKey = new Map<string, ExcalidrawElement>();
  const arrowByEdgeIndex: ExcalidrawElement[] = [];

  // Arrows first so they render behind the boxes they connect.
  for (const [index, edge] of result.edges.entries()) {
    const spec = edges[index];
    const arrow = createArrowElement(
      edge.x,
      edge.y,
      edge.points,
      spec?.arrowType ?? "arrow",
    );
    if (spec?.style) {
      const err = applyStylePatch(arrow, spec.style);
      if (err) return { error: err };
    }
    scene.add(arrow);
    createdIds.push(arrow.id);
    arrowByEdgeIndex[index] = arrow;
  }

  for (const node of result.nodes) {
    const spec = nodesByKey.get(node.key);
    const el = createShapeElement(
      node.shape,
      node.x,
      node.y,
      node.width,
      node.height,
    );
    if (spec?.style) {
      const err = applyStylePatch(el, spec.style);
      if (err) return { error: err };
    }
    scene.add(el);
    createdIds.push(el.id);
    elementByKey.set(node.key, el);

    if (node.text !== undefined) {
      const label = createTextElement(
        node.x,
        node.y,
        sanitizeElementText(node.text),
        el.id,
        node.fontSize,
      );
      // createTextElement measures the text, so the box can only be centred on
      // it afterwards: x/y are the top-left corner, not the centre.
      centreOn(label, node.x + node.width / 2, node.y + node.height / 2);
      addBoundElement(el, { id: label.id, type: "text" });
      scene.add(label);
      createdIds.push(label.id);
    }
  }

  // Bind each arrow now that its endpoints exist, and place its label.
  for (const [index, edge] of result.edges.entries()) {
    const arrow = arrowByEdgeIndex[index];
    const from = elementByKey.get(edge.from);
    const to = elementByKey.get(edge.to);
    if (!arrow || !from || !to) continue;

    if (edge.from === edge.to) {
      // Binding both ends to the same shape makes Excalidraw re-project the
      // arrow onto a single point and the loop disappears. The arc keeps its own
      // geometry instead, and the node still lists it so a delete cleans it up.
      addBoundElement(from, { id: arrow.id, type: "arrow" });
      scene.markChanged(from);
    } else {
      // Clearance is already baked into the points, so the binding gap stays
      // minimal — a larger gap makes Excalidraw re-project the tip and kink it.
      arrow.startBinding = { elementId: from.id, focus: 0, gap: 1 };
      arrow.endBinding = { elementId: to.id, focus: 0, gap: 1 };
      addBoundElement(from, { id: arrow.id, type: "arrow" });
      scene.markChanged(from);
      addBoundElement(to, { id: arrow.id, type: "arrow" });
      scene.markChanged(to);
    }

    if (edge.label) {
      const label = createTextElement(
        edge.label.x,
        edge.label.y,
        sanitizeElementText(edge.label.text),
        edge.label.bound ? arrow.id : null,
        edge.label.fontSize,
      );
      centreOn(label, edge.label.x, edge.label.y);
      if (edge.label.bound) {
        addBoundElement(arrow, { id: label.id, type: "text" });
      } else {
        // A label that is not bound has no relation Excalidraw understands, so
        // move and delete would leave it stranded next to an arrow that is no
        // longer there. Record it on the arrow instead: those two ops follow
        // this, and it costs nothing in the editor.
        arrow.customData = { ...(arrow.customData ?? {}), layoutLabelId: label.id };
        scene.markChanged(arrow);
      }
      scene.add(label);
      createdIds.push(label.id);
    }
  }

  return { createdIds };
};
