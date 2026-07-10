// @vitest-environment node
// Vite/esbuild's programmatic build must run in a real Node environment; the
// default jsdom environment shims TextEncoder in a way esbuild rejects.
import { describe, it, expect } from "vitest";
import path from "path";
import { build, type Rollup } from "vite";

/**
 * Guards the core promise of the dual-engine work: excalidraw-only users must
 * download zero tldraw bytes. tldraw is reached only through the lazy
 * `TldrawEditorPage` import (React.lazy behind the Editor engine branch), so
 * Rollup must place the ~1.6MB SDK in an on-demand chunk that is NOT statically
 * reachable from the app entry.
 *
 * This runs a real production build via Vite's programmatic API (write:false,
 * so it never touches dist/) and walks the static-import graph from the entry
 * chunk, asserting no eagerly-loaded chunk pulls in a tldraw module — while also
 * confirming tldraw IS bundled somewhere (a dynamic chunk), so the test can't
 * pass vacuously if the dependency were dropped.
 */

const FRONTEND_ROOT = path.resolve(__dirname, "../../..");

// Matches tldraw's packages inside node_modules: `tldraw` and any `@tldraw/*`.
const isTldrawModuleId = (id: string): boolean =>
  /[\\/]node_modules[\\/](?:\.pnpm[\\/])?(?:@tldraw[\\/]|tldraw[\\/])/.test(id);

const tldrawModulesIn = (chunk: Rollup.OutputChunk): string[] =>
  Object.keys(chunk.modules).filter(isTldrawModuleId);

describe("bundle split: tldraw stays out of the eager entry graph", () => {
  it(
    "keeps every statically-reachable entry chunk free of tldraw",
    async () => {
      const result = await build({
        root: FRONTEND_ROOT,
        logLevel: "silent",
        build: { write: false, minify: false },
      });

      const outputs = Array.isArray(result) ? result : [result];
      const chunks = outputs
        .flatMap((o) => (o as Rollup.RollupOutput).output)
        .filter((o): o is Rollup.OutputChunk => o.type === "chunk");
      const byFileName = new Map(chunks.map((c) => [c.fileName, c]));

      const entryChunks = chunks.filter((c) => c.isEntry);
      expect(entryChunks.length).toBeGreaterThan(0);

      // Breadth-first over static imports only; dynamic imports are excluded, so
      // a lazily-loaded chunk never enters the eager set.
      const eager = new Set<string>();
      const queue = entryChunks.map((c) => c.fileName);
      while (queue.length > 0) {
        const fileName = queue.pop()!;
        if (eager.has(fileName)) continue;
        eager.add(fileName);
        const chunk = byFileName.get(fileName);
        if (chunk) for (const imp of chunk.imports) queue.push(imp);
      }

      const offenders: string[] = [];
      for (const fileName of eager) {
        const chunk = byFileName.get(fileName);
        if (!chunk) continue;
        const tldrawModules = tldrawModulesIn(chunk);
        if (tldrawModules.length > 0) {
          offenders.push(`${fileName}: ${tldrawModules.slice(0, 3).join(", ")}`);
        }
      }
      expect(
        offenders,
        `eager chunks must not pull in tldraw:\n${offenders.join("\n")}`,
      ).toEqual([]);

      // Sanity: tldraw must actually be bundled (in a non-eager chunk), else the
      // assertion above would hold trivially.
      const tldrawIsBundled = chunks.some((c) => tldrawModulesIn(c).length > 0);
      expect(tldrawIsBundled).toBe(true);
    },
    300_000,
  );
});
