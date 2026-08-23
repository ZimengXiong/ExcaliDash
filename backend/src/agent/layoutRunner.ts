import { Worker } from "worker_threads";
import type { LayoutGraphInput, LayoutResult } from "./layoutTypes";
import type { SolverJob, SolverResult } from "./layoutSolver";
import { layoutGraph } from "./layout";

/**
 * Runs the dagre pass on a worker thread.
 *
 * dagre is CPU-bound, so awaiting it on the main thread does not help: the event
 * loop is blocked for the duration regardless. Its cost also grows with the
 * number of back edges rather than with size, so a densely cyclic graph can take
 * seconds, and that would stall every other tenant's request rather than only
 * the caller's.
 *
 * Only the solver runs off-thread. Measuring labels and building the arrow
 * geometry are cheap and stay here, which keeps the message payload small and
 * serialisable.
 *
 * One job runs at a time and the rest queue behind it, which bounds how much CPU
 * a single caller can claim. A job that overruns kills its worker and fails that
 * one request; the queue moves on to the next job on a fresh worker. Nothing is
 * retried on the main thread: an inline retry after a timeout would take the
 * work the timeout was meant to shed and hand it straight to the event loop.
 */

// The worker resolves dagre from an absolute path handed to it at construction.
// An eval worker resolves bare specifiers against the process working directory,
// so `require("@dagrejs/dagre")` silently fails whenever the server is started
// from anywhere but the backend directory, and every layout then falls back to
// running inline without anything saying so.
const WORKER_SOURCE = `
const { parentPort, workerData } = require("worker_threads");
const dagre = require(workerData.dagrePath);

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
    const edgePoints = {};
    const edgeLabels = {};
    for (const edge of job.edges) {
      const solved = graph.edge({ v: edge.from, w: edge.to, name: edge.name });
      if (!solved) continue;
      if (Array.isArray(solved.points)) {
        edgePoints[edge.name] = solved.points.map((p) => ({ x: p.x, y: p.y }));
      }
      if (typeof solved.x === "number" && typeof solved.y === "number") {
        edgeLabels[edge.name] = { x: solved.x, y: solved.y };
      }
    }
    const size = graph.graph();
    parentPort.postMessage({
      id: job.id,
      ok: true,
      positions,
      edgePoints,
      edgeLabels,
      width: size.width || 0,
      height: size.height || 0,
    });
  } catch (err) {
    parentPort.postMessage({ id: job.id, ok: false, message: String(err && err.message) });
  }
});
`;

/** A layout still running after this is abandoned and its worker replaced. */
export const LAYOUT_TIMEOUT_MS = 10_000;

/** Jobs waiting behind the running one. Past this, callers are turned away. */
export const LAYOUT_QUEUE_LIMIT = 8;

/** The solve ran too long and was abandoned. Callers turn this into a 4xx. */
export class LayoutTimeoutError extends Error {
  constructor() {
    super(`Layout did not finish within ${LAYOUT_TIMEOUT_MS / 1000}s`);
  }
}

/** Too many layouts already queued. Callers turn this into a 503. */
export class LayoutBusyError extends Error {
  constructor() {
    super("Too many layouts in progress");
  }
}

type Job = {
  job: SolverJob;
  id: number;
  resolve: (value: SolverResult) => void;
  reject: (reason: Error) => void;
};

type WorkerMessage = { id: number; ok: boolean; message?: string } & SolverResult;

let worker: Worker | null = null;
let workerUnavailable = false;
let nextJobId = 1;
let running: Job | null = null;
let timer: NodeJS.Timeout | null = null;
const queue: Job[] = [];

/** Counters for whoever is watching: silent degradation is the thing to avoid. */
export const layoutStats = { timeouts: 0, workerFailures: 0, inlineSolves: 0, rejected: 0 };

const clearTimer = (): void => {
  if (timer) clearTimeout(timer);
  timer = null;
};

/** Drop the worker. The running job is failed; the queue survives and restarts. */
const discardWorker = (reason: Error): void => {
  const dying = worker;
  worker = null;
  clearTimer();
  const failed = running;
  running = null;
  if (dying) void dying.terminate();
  failed?.reject(reason);
  dispatch();
};

const onMessage = (message: WorkerMessage): void => {
  if (!running || running.id !== message.id) return; // a late reply from a dead worker
  const entry = running;
  running = null;
  clearTimer();
  if (message.ok) {
    entry.resolve({
      positions: message.positions,
      edgePoints: message.edgePoints,
      edgeLabels: message.edgeLabels,
      width: message.width,
      height: message.height,
    });
  } else {
    entry.reject(new Error(message.message ?? "layout worker failed"));
  }
  dispatch();
};

const getWorker = (): Worker | null => {
  if (worker) return worker;
  if (workerUnavailable) return null;
  try {
    const created = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: { dagrePath: require.resolve("@dagrejs/dagre") },
    });
    created.unref(); // never keep the process alive on its own
    // Handlers are bound to this instance: a late `exit` from a worker that has
    // already been replaced must not take the new one down with it.
    created.on("message", (message: WorkerMessage) => {
      if (worker === created) onMessage(message);
    });
    created.on("error", (err) => {
      if (worker !== created) return;
      layoutStats.workerFailures += 1;
      console.error("[layout] worker error:", err.message);
      discardWorker(err);
    });
    created.on("exit", () => {
      if (worker !== created) return;
      layoutStats.workerFailures += 1;
      discardWorker(new Error("layout worker exited"));
    });
    worker = created;
    return created;
  } catch (error) {
    // A runtime without worker_threads falls back to inline layout permanently.
    // Say so once: the difference is seconds of blocked event loop per request.
    workerUnavailable = true;
    console.error(
      "[layout] no worker thread available, solving inline:",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
};

/** Start the next queued job, if the worker is free. */
function dispatch(): void {
  if (running || queue.length === 0) return;
  const active = getWorker();
  if (!active) {
    // No worker at all: fail everything queued rather than silently moving
    // seconds of CPU onto the request path.
    while (queue.length) queue.shift()?.reject(new LayoutBusyError());
    return;
  }
  const next = queue.shift() as Job;
  running = next;
  // The clock starts here rather than on enqueue, so a job is not charged for
  // the time it spent waiting behind other people's graphs.
  timer = setTimeout(() => {
    layoutStats.timeouts += 1;
    discardWorker(new LayoutTimeoutError());
  }, LAYOUT_TIMEOUT_MS);
  timer.unref();
  active.postMessage({ ...next.job, id: next.id });
}

const solveOnWorker = (job: SolverJob): Promise<SolverResult> => {
  if (queue.length >= LAYOUT_QUEUE_LIMIT) {
    layoutStats.rejected += 1;
    return Promise.reject(new LayoutBusyError());
  }
  return new Promise<SolverResult>((resolve, reject) => {
    queue.push({ job, id: nextJobId++, resolve, reject });
    dispatch();
  });
};

/**
 * Lay out a graph on the worker.
 *
 * A timeout, a busy queue or a solver failure is reported to the caller. The one
 * Worker startup and runtime failures fail closed instead of moving untrusted,
 * CPU-heavy layout work onto the request thread.
 */
export const layoutGraphAsync = async (
  input: LayoutGraphInput,
): Promise<LayoutResult> => {
  if (workerUnavailable) {
    layoutStats.rejected += 1;
    throw new LayoutBusyError();
  }
  return layoutGraph(input, solveOnWorker);
};

/** Release the worker. Tests and the shutdown path use this. */
export const stopLayoutWorker = async (): Promise<void> => {
  const dying = worker;
  worker = null;
  clearTimer();
  const stopped = new Error("layout worker stopped");
  running?.reject(stopped);
  running = null;
  while (queue.length) queue.shift()?.reject(stopped);
  if (dying) await dying.terminate();
};
