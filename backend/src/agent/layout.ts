import type { LayoutGraphInput, LayoutResult, LayoutedNode } from "./layoutTypes";
import type { SolverJob, SolverPlan, SolverResult } from "./layoutSolver";
import { buildSolverPlan, readSolved, solveSync } from "./layoutSolver";
import { assembleEdges } from "./layoutEdges";
import { DEFAULT_NODE_FONT_SIZE, measureNode } from "./layoutText";

/**
 * Geometry for the `layout` op.
 *
 * `add_shape` takes x/y, which means whoever calls it has to decide where every
 * box goes. Models are poor at that: arrows end up crossing unrelated boxes and
 * edge labels land underneath them. This module takes the structure instead —
 * nodes and edges — and derives the geometry with dagre, the same split
 * mermaid-to-excalidraw uses with ELK.
 *
 * It orchestrates three pieces and owns none of them: layoutText measures the
 * labels, layoutSolver runs dagre, layoutEdges turns the solved boxes into
 * arrows. The whole thing is pure: it returns coordinates, and applyOps builds
 * the elements from them through the normal element factory.
 */

export type {
  Box,
  LayoutDirection,
  LayoutEdgeInput,
  LayoutGraphInput,
  LayoutNodeInput,
  LayoutResult,
  LayoutedEdge,
  LayoutedEdgeLabel,
  LayoutedNode,
} from "./layoutTypes";
export type { SolverJob, SolverPlan, SolverResult } from "./layoutSolver";
export { LayoutSolveError } from "./layoutSolver";
export { solveSync } from "./layoutSolver";

const measureNodes = (input: LayoutGraphInput): Map<string, LayoutedNode> => {
  const measured = new Map<string, LayoutedNode>();
  for (const node of input.nodes) {
    const fontSize = node.fontSize ?? DEFAULT_NODE_FONT_SIZE;
    const box = measureNode(node.label, fontSize);
    measured.set(node.key, {
      key: node.key,
      shape: node.shape ?? "rectangle",
      x: 0,
      y: 0,
      width: box.width,
      height: box.height,
      text: box.text,
      fontSize,
    });
  }
  return measured;
};

/** Turn solved node centres into the element geometry the applier needs. */
const assemble = (
  input: LayoutGraphInput,
  measured: Map<string, LayoutedNode>,
  plan: SolverPlan,
  solved: SolverResult,
): LayoutResult => {
  const origin = { x: input.originX ?? 0, y: input.originY ?? 0 };
  const graph = readSolved(plan, solved);

  // dagre positions nodes by centre; Excalidraw wants the top-left corner.
  for (const node of measured.values()) {
    const position = graph.positions.get(node.key);
    if (!position) continue;
    node.x = Math.round(origin.x + position.x - node.width / 2);
    node.y = Math.round(origin.y + position.y - node.height / 2);
  }

  return {
    nodes: [...measured.values()],
    edges: assembleEdges(input.edges, measured, graph, origin),
    width: Math.round(solved.width),
    height: Math.round(solved.height),
  };
};

/**
 * Run the layout and return coordinates for every node and edge.
 *
 * The solver is injected so it can run on a worker thread; `layoutGraphSync`
 * below is the same thing with the inline solver. Unknown edge endpoints are not
 * silently dropped — the caller validates them first and reports them per op.
 */
export const layoutGraph = async (
  input: LayoutGraphInput,
  solve: (job: SolverJob) => Promise<SolverResult>,
): Promise<LayoutResult> => {
  const measured = measureNodes(input);
  const plan = buildSolverPlan(input, measured);
  return assemble(input, measured, plan, await solve(plan.job));
};

/** Layout with the solver running inline on the current thread. */
export const layoutGraphSync = (input: LayoutGraphInput): LayoutResult => {
  const measured = measureNodes(input);
  const plan = buildSolverPlan(input, measured);
  return assemble(input, measured, plan, solveSync(plan.job));
};
