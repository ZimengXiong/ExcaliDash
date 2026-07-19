import type { Op, OpError } from "./opSchemas";

type RefOp = Op & { ref?: string };

export const resolveBatchRefs = (
  op: RefOp,
  opIndex: number,
  refs: Map<string, string>,
): { op: Op } | { error: OpError } => {
  if (op.ref && refs.has(op.ref)) {
    return {
      error: {
        opIndex,
        code: "DUPLICATE_REF",
        message: `Reference "${op.ref}" is already defined`,
      },
    };
  }
  const resolved = structuredClone(op) as Record<string, any>;
  const resolveId = (id: string): string | null => {
    if (!id.startsWith("$")) return id;
    return refs.get(id.slice(1)) ?? null;
  };
  for (const key of ["id", "fromId", "toId"]) {
    if (typeof resolved[key] !== "string") continue;
    const id = resolveId(resolved[key]);
    if (!id) {
      return {
        error: {
          opIndex,
          code: "INVALID_REFERENCE",
          message: `Reference "${resolved[key]}" is not defined before this op`,
        },
      };
    }
    resolved[key] = id;
  }
  if (Array.isArray(resolved.ids)) {
    const ids = resolved.ids.map(resolveId);
    const missing = resolved.ids.find((_: string, index: number) => !ids[index]);
    if (missing) {
      return {
        error: {
          opIndex,
          code: "INVALID_REFERENCE",
          message: `Reference "${missing}" is not defined before this op`,
        },
      };
    }
    resolved.ids = ids;
  }
  return { op: resolved as Op };
};
