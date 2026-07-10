import express from "express";
import rateLimit from "express-rate-limit";
import { v4 as uuidv4 } from "uuid";
import {
  canEditDrawing,
  canViewDrawing,
  getDrawingAccess,
} from "../../authz/sharing";
import { sanitizeDrawingData } from "../../security";
import {
  applyOps,
  type ApplyOpsSuccess,
  type ApplyOpsContext,
} from "../../agent/applyOps";
import { opsBatchSchema, type OpError } from "../../agent/opSchemas";
import { buildStructuralSummary, summarizeElements } from "../../agent/summary";
import { applySceneUpdateTx, isVersionConflict } from "./sceneUpdate";
import type { DrawingRouteContext } from "./drawingRouteContext";

// Distinct sentinel so applySceneUpdateTx's caller can tell an op-validation
// abort (422) apart from a version conflict (409). Thrown from inside the tx to
// roll back before any snapshot/write happens.
const opsValidationError = new Error("OPS_VALIDATION_FAILED");

export const registerDrawingAgentRoutes = (
  app: express.Express,
  context: DrawingRouteContext,
) => {
  const {
    prisma,
    requireAuth,
    asyncHandler,
    parseJsonField,
    invalidateDrawingsCache,
    logAuditEvent,
    io,
  } = context;
  const agentOps = context.agentOps ?? {
    rateLimitMaxRequests: 120,
    rateLimitWindowMs: 60000,
  };

  const opsRateLimiter = rateLimit({
    windowMs: agentOps.rateLimitWindowMs,
    max: agentOps.rateLimitMaxRequests,
    keyGenerator: (req) => req.user?.id ?? req.ip ?? "anonymous",
    message: {
      error: "Rate limit exceeded",
      message: "Too many agent op batches, please slow down",
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false, xForwardedForHeader: false },
  });

  // POST /drawings/:id/ops — apply a semantic op batch atomically.
  app.post(
    "/drawings/:id/ops",
    requireAuth,
    opsRateLimiter,
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      if (!req.principal) return res.status(401).json({ error: "Unauthorized" });

      const access = await getDrawingAccess({
        prisma,
        principal: req.principal,
        drawingId: id,
      });
      if (!canEditDrawing(access)) {
        return res
          .status(canViewDrawing(access) ? 403 : 404)
          .json({ error: canViewDrawing(access) ? "Forbidden" : "Drawing not found" });
      }

      const parsed = opsBatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid ops batch",
          details: parsed.error.issues,
        });
      }
      const { ops, clientBatchId } = parsed.data;

      // revert_to_snapshot needs the pre-image; fetch every referenced snapshot
      // up front so the applier stays synchronous inside the tx.
      const ctx: ApplyOpsContext = {};
      const revertVersions = ops
        .filter((op) => op.op === "revert_to_snapshot")
        .map((op) => (op as { version: number }).version);
      if (revertVersions.length > 0) {
        const snaps = await prisma.drawingSnapshot.findMany({
          where: { drawingId: id, version: { in: revertVersions } },
        });
        const map = new Map<number, any[]>();
        for (const snap of snaps) {
          map.set(snap.version, parseJsonField(snap.elements, []));
        }
        ctx.snapshotElementsByVersion = map;
      }

      let opsError: OpError[] | null = null;
      let applied: ApplyOpsSuccess | null = null;

      try {
        const result = await applySceneUpdateTx({
          prisma,
          drawingId: id,
          parseJsonField,
          versionGuard: "optimistic",
          maxRetries: 3,
          mutate: (current) => {
            const currentElements = parseJsonField<any[]>(current.elements, []);
            const currentAppState = parseJsonField<Record<string, unknown>>(
              current.appState,
              {},
            );
            const out = applyOps({ ops, elements: currentElements, ctx });
            if (out.ok === false) {
              opsError = out.errors;
              throw opsValidationError;
            }
            const okOut: ApplyOpsSuccess = out;
            // Identical sanitization to a normal save.
            const sanitized = sanitizeDrawingData({
              elements: okOut.elements,
              appState: currentAppState,
              files: undefined,
              preview: null,
            });
            applied = { ...okOut, elements: sanitized.elements as any[] };
            return { data: { elements: JSON.stringify(sanitized.elements) } };
          },
        });

        const success = applied as ApplyOpsSuccess | null;
        if (!success) {
          throw new Error("Ops applied without a result");
        }

        const changedElements = success.elements.filter((el) =>
          success.changedIds.has(el.id),
        );
        const opsBatchId = uuidv4();
        const newVersion = result.drawing.version;

        // Ride the existing socket relay so open editors render agent edits
        // live with zero frontend collab changes. Deleted elements travel as
        // tombstones (isDeleted:true), matching Excalidraw reconciliation.
        if (io) {
          io.to(`drawing_${id}`).emit("element-update", {
            drawingId: id,
            elements: changedElements,
            elementOrder: success.orderChanged
              ? success.elements.map((el) => el.id)
              : undefined,
            origin: "agent-ops",
            opsBatchId,
          });
        }

        invalidateDrawingsCache();
        await logAuditEvent({
          userId: req.principal.userId,
          action: "agent_ops_applied",
          resource: `drawing:${id}`,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
          details: { opsBatchId, opCount: ops.length, clientBatchId },
        });

        return res.json({
          opsBatchId,
          version: newVersion,
          revertVersion: result.revertVersion,
          results: success.results,
          summaryDelta: summarizeElements(changedElements),
          summary: buildStructuralSummary({
            name: result.drawing.name,
            version: newVersion,
            elements: success.elements,
          }),
        });
      } catch (error) {
        if (error === opsValidationError && opsError) {
          return res.status(422).json({
            error: "Ops validation failed",
            errors: opsError,
          });
        }
        if (isVersionConflict(error)) {
          return res.status(409).json({
            error: "Conflict",
            code: "VERSION_CONFLICT",
            message: "Drawing changed concurrently; retry the batch.",
          });
        }
        throw error;
      }
    }),
  );

  // GET /drawings/:id/summary — structural read path (text/plain).
  app.get(
    "/drawings/:id/summary",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      if (!req.principal) return res.status(401).json({ error: "Unauthorized" });

      const access = await getDrawingAccess({
        prisma,
        principal: req.principal,
        drawingId: id,
      });
      if (!canViewDrawing(access)) {
        return res.status(404).json({ error: "Drawing not found" });
      }

      const drawing = await prisma.drawing.findUnique({ where: { id } });
      if (!drawing) return res.status(404).json({ error: "Drawing not found" });

      const summary = buildStructuralSummary({
        name: drawing.name,
        version: drawing.version,
        elements: parseJsonField(drawing.elements, []),
      });
      res.type("text/plain").send(summary);
    }),
  );

  // GET /drawings/:id/elements/:elementId — full element JSON + bound children.
  app.get(
    "/drawings/:id/elements/:elementId",
    requireAuth,
    asyncHandler(async (req, res) => {
      const { id, elementId } = req.params;
      if (!req.principal) return res.status(401).json({ error: "Unauthorized" });

      const access = await getDrawingAccess({
        prisma,
        principal: req.principal,
        drawingId: id,
      });
      if (!canViewDrawing(access)) {
        return res.status(404).json({ error: "Drawing not found" });
      }

      const drawing = await prisma.drawing.findUnique({ where: { id } });
      if (!drawing) return res.status(404).json({ error: "Drawing not found" });

      const elements = parseJsonField<any[]>(drawing.elements, []);
      const element = elements.find((el) => el?.id === elementId && !el?.isDeleted);
      if (!element) {
        return res.status(404).json({ error: "Element not found" });
      }

      // Include bound-label children so the caller sees the full logical unit.
      const boundIds = new Set(
        (Array.isArray(element.boundElements) ? element.boundElements : [])
          .map((b: any) => b?.id)
          .filter((v: unknown): v is string => typeof v === "string"),
      );
      const children = elements.filter(
        (el) => boundIds.has(el?.id) && !el?.isDeleted,
      );

      return res.json({ element, children });
    }),
  );
};
