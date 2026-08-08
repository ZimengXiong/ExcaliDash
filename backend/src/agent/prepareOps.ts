import type { ApplyOpsContext } from "./applyOps";
import { layoutInputFor, validateLayoutOp } from "./applyLayout";
import type { LayoutResult } from "./layout";
import {
  LayoutBusyError,
  LayoutTimeoutError,
  layoutGraphAsync,
} from "./layoutRunner";
import { LayoutSolveError } from "./layoutSolver";
import type { Op, OpError } from "./opSchemas";

/**
 * Everything an op batch needs that cannot be done inside the transaction.
 *
 * Both entry points, the REST route and the AI chat tool, apply their batch
 * through a synchronous applier inside a Prisma transaction. Anything slow or
 * asynchronous therefore has to happen first, which is the pattern the snapshot
 * fetch for revert_to_snapshot already follows. A layout that solved inside the
 * transaction would hold the write lock for the whole solve and block the event
 * loop with it, so it is prepared here instead.
 */
// `errors` is present when the batch itself is at fault, absent for capacity.
export type PrepareOpsResult =
  | { ok: true; ctx: ApplyOpsContext }
  | { ok: false; status: number; body: Record<string, unknown>; errors?: OpError[] };

/**
 * Narrowing helper. The project compiles with strict off, and without
 * strictNullChecks TypeScript will not discriminate this union on `ok` alone.
 */
export const prepareFailed = (
  result: PrepareOpsResult,
): result is Extract<PrepareOpsResult, { ok: false }> => !result.ok;

type SnapshotLoader = (versions: number[]) => Promise<Map<number, unknown[]>>;

const opErrorResult = (status: number, errors: OpError[]): PrepareOpsResult => ({
  ok: false,
  status,
  body: { error: "Ops validation failed", errors },
  errors,
});

/** Translate a solver failure into something the caller can act on. */
const layoutFailure = (error: unknown, index: number): PrepareOpsResult => {
  if (error instanceof LayoutBusyError) {
    return {
      ok: false,
      status: 503,
      body: {
        error: "Busy",
        code: "LAYOUT_BUSY",
        message: "Too many layouts in progress; retry shortly.",
      },
    };
  }
  if (error instanceof LayoutTimeoutError || error instanceof LayoutSolveError) {
    return opErrorResult(422, [
      {
        opIndex: index,
        code: "LAYOUT_FAILED",
        message: error instanceof Error ? error.message : String(error),
      },
    ]);
  }
  throw error;
};

export const prepareOpsContext = async (
  ops: Op[],
  loadSnapshots: SnapshotLoader,
): Promise<PrepareOpsResult> => {
  const ctx: ApplyOpsContext = {};

  const revertVersions = ops
    .filter((op) => op.op === "revert_to_snapshot")
    .map((op) => (op as { version: number }).version);
  if (revertVersions.length > 0) {
    ctx.snapshotElementsByVersion = (await loadSnapshots(revertVersions)) as Map<
      number,
      never[]
    >;
  }

  const layoutOps = ops
    .map((op, index) => ({ op, index }))
    .filter((entry) => entry.op.op === "layout") as {
    op: Extract<Op, { op: "layout" }>;
    index: number;
  }[];
  if (layoutOps.length === 0) return { ok: true, ctx };

  const solved = new Map<number, LayoutResult>();
  for (const { op, index } of layoutOps) {
    // Reject what can be rejected without solving anything. Otherwise a
    // misspelled style key on a 200-node graph still costs a full solve before
    // the batch is turned away.
    const invalid = validateLayoutOp(op);
    if (invalid) {
      return opErrorResult(422, [{ opIndex: index, ...invalid }]);
    }
    try {
      solved.set(index, await layoutGraphAsync(layoutInputFor(op)));
    } catch (error) {
      return layoutFailure(error, index);
    }
  }
  ctx.layoutByOpIndex = solved;
  return { ok: true, ctx };
};
