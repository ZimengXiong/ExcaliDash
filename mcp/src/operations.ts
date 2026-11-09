export type WireOp = Record<string, unknown> & { op: string };
export type OpsResult = {
  version: number;
  results: { opIndex: number; createdIds?: string[] }[];
  [key: string]: unknown;
};

/** Owned by one MCP session. No state is shared between McpServer instances. */
export class AliasScope {
  private readonly byDrawing = new Map<string, Map<string, string>>();

  forget(drawingId: string): void {
    this.byDrawing.delete(drawingId);
  }

  prepare(drawingId: string, ops: WireOp[]): WireOp[] {
    const known = this.byDrawing.get(drawingId) ?? new Map<string, string>();
    const declared = new Set<string>();
    for (const op of ops) {
      if (op.op !== "add_shape" || typeof op.ref !== "string") continue;
      if (declared.has(op.ref)) throw new Error("Duplicate ref in batch");
      declared.add(op.ref);
    }
    let total = 0;
    for (const map of this.byDrawing.values()) total += map.size;
    for (const ref of declared) if (!known.has(ref)) total++;
    if (total > 1000) throw new Error("Session alias limit exceeded");

    return ops.map((op) => {
      const wire = { ...op };
      delete wire.ref;
      for (const field of ["id", "fromId", "toId"]) {
        const value = wire[field];
        if (typeof value !== "string") continue;
        if (declared.has(value)) {
          throw new Error(
            "Create refs in one call; reference them in the next call",
          );
        }
        wire[field] = known.get(value) ?? value;
      }
      return wire;
    });
  }

  commit(
    drawingId: string,
    original: WireOp[],
    result: OpsResult,
  ): Record<string, string> {
    // Validate the entire response before changing any session state. The write
    // already happened: missing IDs must never trigger a blind mutation retry.
    const pending = new Map<number, { ref: string; id: string }>();
    for (let i = 0; i < original.length; i++) {
      const op = original[i]!;
      if (op.op !== "add_shape" || typeof op.ref !== "string") continue;
      const matches = result.results.filter((item) => item.opIndex === i);
      const id = matches[0]?.createdIds?.[0];
      if (matches.length !== 1 || typeof id !== "string" || !id) {
        throw new Error(
          "Batch applied but response IDs missing; read drawing, do not retry",
        );
      }
      pending.set(i, { ref: op.ref, id });
    }

    const known = this.byDrawing.get(drawingId);
    const next = new Map(known);
    const refs: Record<string, string> = Object.create(null);
    for (let i = 0; i < original.length; i++) {
      const op = original[i]!;
      if (op.op === "revert_to_snapshot") {
        next.clear();
        for (const key of Object.keys(refs)) delete refs[key];
      }
      if (op.op === "delete" && typeof op.id === "string") {
        // Resolve against the pre-request map, just as prepare did. Earlier
        // operations in this batch may have cleared the next map after revert.
        const id = known?.get(op.id) ?? op.id;
        for (const [key, value] of next) {
          if (value !== id) continue;
          next.delete(key);
          delete refs[key];
        }
      }
      const created = pending.get(i);
      if (created) {
        next.set(created.ref, created.id);
        refs[created.ref] = created.id;
      }
    }
    if (next.size) this.byDrawing.set(drawingId, next);
    else this.forget(drawingId);
    return Object.fromEntries(Object.entries(refs));
  }
}
