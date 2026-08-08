import { Worker } from "worker_threads";
import type { LayoutGraphInput, LayoutResult } from "./layoutTypes";
import type { SolverJob, SolverResult } from "./layoutSolver";
import { layoutGraph, layoutGraphSync } from "./layout";

/**
 * Runs the dagre pass on a worker thread.
 *
 * dagre is CPU-bound, so awaiting it on the main thread does not help: the event
 * loop is blocked for the duration regardless. Its cost also grows with the
 * number of back edges rather than with size, so a densely cyclic graph can take
 * seconds — and that would stall every other tenant's request, not just the
 * caller's.
 *
 * Only the solver runs off-thread. Measuring labels and building the arrow
 * geometry are cheap and stay here, which keeps the message payload small and
 * serialisable.
 *
 * The worker is created once and reused; a crashed or timed-out worker is
 * discarded and the next call starts a fresh one. If a worker cannot be started
 * at all, layout falls back to running inline, so a restricted runtime degrades
 * in speed rather than breaking.
 */

// Worker source is inlined rather than loaded from a file: the backend runs from
// src/ under nodemon in development and from dist/ in production, and an inline
// worker avoids resolving a different path in each.
const WORKER_SOURCE = `
const { parentPort } = require("worker_threads");
const dagre = require("@dagrejs/dagre");

parentPort.on("message", (job) => {
  try {
    const graph = new dagre.graphlib.Graph({ multigraph: true });
    graph.setGraph(job.graphOptions);
    graph.setDefaultEdgeLabel(() => ({}));
    for (const node of job.nodes) {
      graph.setNode(node.key, { width: node.width, height: node.height });
    }
    for (const edge of job.edges) {
      graph.setEdge(edge.from, edge.to, edge.label || {}, edge.name);
    }
    // useDynamic:false — see the note on LAYOUT_OPTIONS in layoutSolver.ts. This
    // thread is long-lived, so the module-scoped cache would accumulate here.
    dagre.layout(graph, { useDynamic: false });
    const positions = {};
    for (const node of job.nodes) {
      const pos = graph.node(node.key);
      if (pos) positions[node.key] = { x: pos.x, y: pos.y };
    }
    const size = graph.graph();
    parentPort.postMessage({
      id: job.id,
      ok: true,
      positions,
      width: size.width || 0,
      height: size.height || 0,
    });
  } catch (err) {
    parentPort.postMessage({ id: job.id, ok: false, message: String(err && err.message) });
  }
});
`;

/** A layout taking longer than this is abandoned and the worker replaced. */
const LAYOUT_TIMEOUT_MS = 10_000;

type Pending = {
  resolve: (value: SolverResult) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
};

let worker: Worker | null = null;
let workerUnavailable = false;
let nextJobId = 1;
const pending = new Map<number, Pending>();

const disposeWorker = (reason: Error): void => {
  const dying = worker;
  worker = null;
  for (const [, entry] of pending) {
    clearTimeout(entry.timer);
    entry.reject(reason);
  }
  pending.clear();
  if (dying) void dying.terminate();
};

const getWorker = (): Worker | null => {
  if (worker) return worker;
  if (workerUnavailable) return null;
  try {
    const created = new Worker(WORKER_SOURCE, { eval: true });
    created.unref(); // never keep the process alive on its own
    created.on("message", (msg: { id: number; ok: boolean; message?: string } & SolverResult) => {
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      clearTimeout(entry.timer);
      if (msg.ok) {
        entry.resolve({ positions: msg.positions, width: msg.width, height: msg.height });
      } else {
        entry.reject(new Error(msg.message ?? "layout worker failed"));
      }
    });
    created.on("error", (err) => disposeWorker(err));
    created.on("exit", () => disposeWorker(new Error("layout worker exited")));
    worker = created;
    return created;
  } catch {
    // Runtimes without worker_threads fall back to inline layout permanently.
    workerUnavailable = true;
    return null;
  }
};

const solveOnWorker = (job: SolverJob): Promise<SolverResult> => {
  const active = getWorker();
  if (!active) return Promise.reject(new Error("no layout worker"));
  const id = nextJobId++;
  return new Promise<SolverResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      disposeWorker(new Error("layout timed out"));
      reject(new Error("layout timed out"));
    }, LAYOUT_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    active.postMessage({ ...job, id });
  });
};

/**
 * Lay out a graph, using the worker when one is available and falling back to an
 * inline pass otherwise. Callers get the same result either way.
 */
export const layoutGraphAsync = async (
  input: LayoutGraphInput,
): Promise<LayoutResult> => {
  try {
    return await layoutGraph(input, solveOnWorker);
  } catch {
    // A worker that failed or timed out should not fail the request: the inline
    // path produces the same geometry, it just occupies the event loop.
    return layoutGraphSync(input);
  }
};

/** Release the worker. Tests and shutdown paths use this. */
export const stopLayoutWorker = async (): Promise<void> => {
  const dying = worker;
  worker = null;
  for (const [, entry] of pending) {
    clearTimeout(entry.timer);
    entry.reject(new Error("layout worker stopped"));
  }
  pending.clear();
  if (dying) await dying.terminate();
};
