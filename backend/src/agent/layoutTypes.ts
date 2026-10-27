import type { ShapeKind } from "./opSchemas";

/**
 * Geometry vocabulary for the `layout` op.
 *
 * These types are shared by the solver adapter, the edge assembly and the
 * applier. They live in their own module so the low-level pieces never have to
 * import from the orchestrator that uses them.
 */

export type LayoutDirection = "TB" | "BT" | "LR" | "RL";

export type LayoutNodeInput = {
  key: string;
  label?: string;
  shape?: ShapeKind;
  fontSize?: number;
};

export type LayoutEdgeInput = {
  from: string;
  to: string;
  label?: string;
};

export type LayoutGraphInput = {
  nodes: LayoutNodeInput[];
  edges: LayoutEdgeInput[];
  direction?: LayoutDirection;
  originX?: number;
  originY?: number;
};

export type LayoutedNode = {
  key: string;
  shape: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Label text after wrapping; absent when the node has no label. */
  text?: string;
  fontSize: number;
};

export type LayoutedEdgeLabel = {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  /**
   * Bound labels are placed by Excalidraw at the arrow's midpoint, which is
   * exactly where parallel edges collide. Those are emitted unbound with an
   * explicit position instead.
   */
  bound: boolean;
};

export type LayoutedEdge = {
  from: string;
  to: string;
  x: number;
  y: number;
  points: [number, number][];
  label?: LayoutedEdgeLabel;
};

export type LayoutResult = {
  nodes: LayoutedNode[];
  edges: LayoutedEdge[];
  width: number;
  height: number;
};

export type Box = { x: number; y: number; width: number; height: number };
