import { afterAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { layoutGraphSync } from "./layout";
import {
  LAYOUT_QUEUE_LIMIT,
  LayoutBusyError,
  layoutGraphAsync,
  layoutStats,
  stopLayoutWorker,
} from "./layoutRunner";

afterAll(async () => {
  await stopLayoutWorker();
});

/** A graph whose back edges make dagre expensive. */
const cyclicGraph = (nodeCount: number) => {
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({
    key: `n${i}`,
    label: `Node ${i}`,
  }));
  const edges: { from: string; to: string }[] = [];
  for (let i = 0; i < nodeCount; i++) {
    edges.push({ from: `n${i}`, to: `n${(i + 1) % nodeCount}` });
  }
  for (let i = 0; i < nodeCount; i++) {
    const from = `n${(i * 7) % nodeCount}`;
    const to = `n${(i * 13 + 1) % nodeCount}`;
    if (from !== to) edges.push({ from, to });
  }
  return { nodes, edges };
};

/**
 * Time a run and record how late a 10ms timer fired while it was going.
 *
 * The settle window before clearing the ticker is what makes this measure
 * anything at all. Resolving the promise is a microtask and runs before any
 * pending timer, so clearing the interval straight after the await removes the
 * very tick that would have reported the stall: a fully blocked event loop
 * measures as zero delay. That is not hypothetical, it is how a blocking
 * regression stayed invisible here once already.
 */
const measure = async (run: () => Promise<unknown> | unknown) => {
  let worstDelayMs = 0;
  let last = Date.now();
  const ticker = setInterval(() => {
    const now = Date.now();
    worstDelayMs = Math.max(worstDelayMs, now - last - 10);
    last = now;
  }, 10);
  const started = Date.now();
  try {
    await run();
  } catch {
    // Timing is the subject here; the caller asserts on the outcome separately.
  }
  const durationMs = Date.now() - started;
  await new Promise((resolve) => setTimeout(resolve, 80));
  clearInterval(ticker);
  return { durationMs, worstDelayMs };
};

describe("layoutGraphAsync", () => {
  it("produces the same geometry as the inline pass", async () => {
    const input = {
      nodes: [
        { key: "a", label: "Web App" },
        { key: "b", label: "API Gateway" },
        { key: "c", label: "Postgres" },
      ],
      edges: [
        { from: "a", to: "b", label: "POST /orders" },
        { from: "b", to: "c", label: "persist" },
      ],
      direction: "LR" as const,
    };
    const [viaWorker, inline] = [await layoutGraphAsync(input), layoutGraphSync(input)];
    expect(viaWorker.nodes).toEqual(inline.nodes);
    expect(viaWorker.edges).toEqual(inline.edges);
    expect(viaWorker.width).toBe(inline.width);
  });

  it("keeps the event loop responsive while an expensive graph is solving", async () => {
    const graph = cyclicGraph(120);
    const inline = await measure(() => layoutGraphSync(graph));
    const worker = await measure(() => layoutGraphAsync(graph));

    // The graph has to be slow enough for the comparison to mean anything.
    expect(inline.durationMs).toBeGreaterThan(150);
    // Inline blocks for essentially the whole solve…
    expect(inline.worstDelayMs).toBeGreaterThan(inline.durationMs * 0.8);
    // …while the worker leaves the loop free.
    expect(worker.worstDelayMs).toBeLessThan(inline.worstDelayMs / 10);
  }, 60_000);

  it("stays responsive with several expensive graphs queued at once", async () => {
    const graph = cyclicGraph(120);
    const single = await measure(() => layoutGraphSync(graph));

    const many = await measure(() =>
      Promise.all(Array.from({ length: 4 }, () => layoutGraphAsync(graph))),
    );

    // Four solves run one after another, so this takes longer than one…
    expect(many.durationMs).toBeGreaterThan(single.durationMs);
    // …and none of that time is taken from the event loop.
    expect(many.worstDelayMs).toBeLessThan(single.worstDelayMs / 10);
  }, 120_000);

  it("fails the request rather than solving inline when the worker goes away", async () => {
    const before = layoutStats.inlineSolves;
    const pending = layoutGraphAsync(cyclicGraph(60));
    const rejected = expect(pending).rejects.toThrow();
    await stopLayoutWorker();
    await rejected;
    // The old behaviour caught this and re-ran the same graph on the main
    // thread, which is exactly the CPU the worker exists to move off it.
    expect(layoutStats.inlineSolves).toBe(before);
  }, 30_000);

  it("turns callers away once the queue is full instead of growing it", async () => {
    const graph = cyclicGraph(90);
    const attempts = Array.from({ length: LAYOUT_QUEUE_LIMIT + 4 }, () =>
      layoutGraphAsync(graph).catch((error: unknown) => error),
    );
    const results = await Promise.all(attempts);
    const busy = results.filter((r) => r instanceof LayoutBusyError);
    expect(busy.length).toBeGreaterThan(0);
    expect(results.length - busy.length).toBeLessThanOrEqual(LAYOUT_QUEUE_LIMIT + 1);
  }, 120_000);
});

// An eval worker resolves bare specifiers against the working directory the
// process was started in, so requiring "@dagrejs/dagre" by name worked only when
// the server happened to be started from the backend directory. Everywhere else
// the worker failed and every layout quietly ran inline instead.
//
// process.chdir() cannot reproduce that: the resolution base is fixed at process
// start, so this has to be a child process. It runs against the build output,
// and skips when there is none rather than failing for the wrong reason.
const BUILT_RUNNER = path.join(__dirname, "..", "..", "dist", "agent", "layoutRunner.js");

describe.skipIf(!fs.existsSync(BUILT_RUNNER))("worker module resolution", () => {
  it("uses the worker when the process was started from another directory", () => {
    const probe = `
      const { layoutGraphAsync, stopLayoutWorker } = require(${JSON.stringify(BUILT_RUNNER)});
      const nodes = Array.from({ length: 120 }, (_, i) => ({ key: "n" + i, label: "Node " + i }));
      const edges = [];
      for (let i = 0; i < 120; i++) edges.push({ from: "n" + i, to: "n" + ((i + 1) % 120) });
      for (let i = 0; i < 120; i++) {
        const from = "n" + ((i * 7) % 120);
        const to = "n" + ((i * 13 + 1) % 120);
        if (from !== to) edges.push({ from, to });
      }
      let worst = 0, last = Date.now();
      const ticker = setInterval(() => {
        const now = Date.now();
        worst = Math.max(worst, now - last - 10);
        last = now;
      }, 10);
      layoutGraphAsync({ nodes, edges })
        .then(() => new Promise((r) => setTimeout(r, 80)))
        .then(async () => {
          clearInterval(ticker);
          await stopLayoutWorker();
          console.log(JSON.stringify({ worst }));
        })
        .catch((e) => { console.log(JSON.stringify({ error: String(e && e.message) })); process.exit(0); });
    `;
    const run = spawnSync(process.execPath, ["-e", probe], {
      cwd: os.tmpdir(),
      encoding: "utf8",
      timeout: 60_000,
    });
    const output = JSON.parse((run.stdout || "{}").trim().split("\n").pop() as string);
    expect(output.error).toBeUndefined();
    // Solving this graph inline blocks for well over a second.
    expect(output.worst).toBeLessThan(200);
  }, 90_000);
});
