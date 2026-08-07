import { afterAll, describe, expect, it } from "vitest";
import { layoutGraphSync } from "./layout";
import { layoutGraphAsync, stopLayoutWorker } from "./layoutRunner";

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

    // A 10ms timer records how late it actually fires. The settle window after
    // the run matters: without it the timer never gets a turn before the
    // assertion, and a fully blocked loop would measure as zero delay.
    const measure = async (run: () => Promise<unknown> | unknown) => {
      let worstDelayMs = 0;
      let last = Date.now();
      const ticker = setInterval(() => {
        const now = Date.now();
        worstDelayMs = Math.max(worstDelayMs, now - last - 10);
        last = now;
      }, 10);
      const started = Date.now();
      await run();
      const durationMs = Date.now() - started;
      await new Promise((resolve) => setTimeout(resolve, 60));
      clearInterval(ticker);
      return { durationMs, worstDelayMs };
    };

    const inline = await measure(() => layoutGraphSync(graph));
    const worker = await measure(() => layoutGraphAsync(graph));

    // The graph has to be slow enough for the comparison to mean anything.
    expect(inline.durationMs).toBeGreaterThan(150);
    // Inline blocks for essentially the whole solve…
    expect(inline.worstDelayMs).toBeGreaterThan(inline.durationMs * 0.8);
    // …while the worker leaves the loop free.
    expect(worker.worstDelayMs).toBeLessThan(inline.worstDelayMs / 10);
  }, 60_000);

  it("still returns geometry when the worker cannot be used", async () => {
    // Terminating mid-flight exercises the inline fallback path.
    const pending = layoutGraphAsync(cyclicGraph(40));
    await stopLayoutWorker();
    const result = await pending;
    expect(result.nodes.length).toBe(40);
  }, 30_000);
});
