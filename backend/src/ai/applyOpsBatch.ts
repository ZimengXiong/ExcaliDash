import express from "express";
import { v4 as uuidv4 } from "uuid";
import type { PrismaClient } from "../generated/client";
import { sanitizeDrawingData } from "../security";
import { applyOps, type ApplyOpsSuccess } from "../agent/applyOps";
import { prepareFailed, prepareOpsContext } from "../agent/prepareOps";
import { opsBatchSchema, type OpError } from "../agent/opSchemas";
import { buildStructuralSummary, summarizeElements } from "../agent/summary";
import { applySceneUpdateTx, isVersionConflict } from "../routes/dashboard/sceneUpdate";
import type { AuditLogData } from "../utils/audit";

export type RegisterAiRoutesDeps = {
  prisma: PrismaClient;
  requireAuth: express.RequestHandler;
  asyncHandler: (
    fn: (req: express.Request, res: express.Response, next: express.NextFunction) => unknown,
  ) => express.RequestHandler;
  parseJsonField: <T>(raw: string | null | undefined, fallback: T) => T;
  invalidateDrawingsCache: () => void;
  logAuditEvent: (event: AuditLogData) => Promise<void>;
  io?: {
    to: (room: string) => { emit: (event: string, payload: unknown) => void };
  } | null;
  defaultSystemConfigId: string;
};

export type ApplyOpsBatchResult =
  | {
      ok: true;
      version: number;
      revertVersion: number;
      summary: string;
      summaryDelta: string[];
      opsBatchId: string;
    }
  | { ok: false; errors: OpError[] };

// Apply one validated op batch through the shared scene-update transaction —
// identical snapshot / sanitize / version semantics as a normal save — then
// broadcast to open editors. Mirrors the REST agent-ops route.
export const applyOpsBatch = async (
  deps: RegisterAiRoutesDeps,
  drawingId: string,
  userId: string,
  rawOps: unknown,
): Promise<ApplyOpsBatchResult> => {
  const parsed = opsBatchSchema.safeParse(rawOps);
  if (!parsed.success) {
    return {
      ok: false,
      errors: [
        {
          opIndex: 0,
          code: "INVALID_OP",
          message: `Invalid ops batch: ${parsed.error.issues
            .map((i) => i.message)
            .join("; ")
            .slice(0, 300)}`,
        },
      ],
    };
  }
  const { ops } = parsed.data;

  // Same preparation as the REST route, and for the same reason: the applier
  // below runs synchronously inside a transaction, so a layout has to be solved
  // on the worker before the transaction opens rather than on the main thread
  // while it holds the write lock.
  const prepared = await prepareOpsContext(ops, async (versions) => {
    const snaps = await deps.prisma.drawingSnapshot.findMany({
      where: { drawingId, version: { in: versions } },
    });
    const map = new Map<number, any[]>();
    for (const snap of snaps) map.set(snap.version, deps.parseJsonField(snap.elements, []));
    return map;
  });
  if (prepareFailed(prepared)) {
    return {
      ok: false,
      errors: prepared.errors ?? [
        { opIndex: 0, code: "UNSUPPORTED", message: String(prepared.body.message ?? "Layout unavailable") },
      ],
    };
  }
  const ctx = (prepared as Extract<typeof prepared, { ok: true }>).ctx;

  const validationError = new Error("OPS_VALIDATION_FAILED");
  let opsError: OpError[] | null = null;
  let applied: ApplyOpsSuccess | null = null;

  try {
    const result = await applySceneUpdateTx({
      prisma: deps.prisma,
      drawingId,
      parseJsonField: deps.parseJsonField,
      versionGuard: "optimistic",
      maxRetries: 3,
      mutate: (current) => {
        const currentElements = deps.parseJsonField<any[]>(current.elements, []);
        const currentAppState = deps.parseJsonField<Record<string, unknown>>(
          current.appState,
          {},
        );
        const out = applyOps({ ops, elements: currentElements, ctx });
        if (out.ok === false) {
          opsError = out.errors;
          throw validationError;
        }
        const sanitized = sanitizeDrawingData({
          elements: out.elements,
          appState: currentAppState,
          files: undefined,
          preview: null,
        });
        applied = { ...out, elements: sanitized.elements as any[] };
        return { data: { elements: JSON.stringify(sanitized.elements) } };
      },
    });

    const success = applied as ApplyOpsSuccess | null;
    if (!success) throw new Error("Ops applied without a result");

    const changedElements = success.elements.filter((el) =>
      success.changedIds.has(el.id),
    );
    const opsBatchId = uuidv4();
    const newVersion = result.drawing.version;

    if (deps.io) {
      deps.io.to(`drawing_${drawingId}`).emit("element-update", {
        drawingId,
        elements: changedElements,
        elementOrder: success.orderChanged
          ? success.elements.map((el) => el.id)
          : undefined,
        origin: "agent-ops",
        opsBatchId,
      });
    }

    deps.invalidateDrawingsCache();
    await deps.logAuditEvent({
      userId,
      action: "agent_ops_applied",
      resource: `drawing:${drawingId}`,
      details: { opsBatchId, opCount: ops.length, source: "ai-chat" },
    });

    return {
      ok: true,
      version: newVersion,
      revertVersion: result.revertVersion,
      summary: buildStructuralSummary({
        name: result.drawing.name,
        version: newVersion,
        elements: success.elements,
      }),
      summaryDelta: summarizeElements(changedElements),
      opsBatchId,
    };
  } catch (error) {
    if (error === validationError && opsError) {
      return { ok: false, errors: opsError };
    }
    if (isVersionConflict(error)) {
      return {
        ok: false,
        errors: [
          {
            opIndex: 0,
            code: "INVALID_OP",
            message: "Drawing changed concurrently; ask the user to retry.",
          },
        ],
      };
    }
    throw error;
  }
};
