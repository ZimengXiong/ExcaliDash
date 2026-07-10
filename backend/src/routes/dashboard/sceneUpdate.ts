import { Prisma, PrismaClient } from "../../generated/client";

// A file entry is "blank" when it exists but carries no content (empty
// dataURL). Sanitizer tombstones and transient client state can produce
// these; they must never overwrite an existing entry that still has content.
export const isBlankFileEntry = (entry: unknown): boolean => {
  if (!entry || typeof entry !== "object") return true;
  const dataURL = (entry as { dataURL?: unknown }).dataURL;
  if (typeof dataURL === "string") return dataURL.length === 0;
  return false;
};

// Merge incoming files into the existing set by fileId (union). Removal is
// never performed here — only the trim/orphans routes delete files — so a
// save from a client with a partial/stale view of the files object cannot
// delete another client's images. Same-id updates overwrite, except a blank
// incoming entry never clobbers existing content.
export const mergeFilesUnion = (
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> => {
  const merged: Record<string, unknown> = { ...existing };
  for (const [fileId, entry] of Object.entries(incoming)) {
    if (
      isBlankFileEntry(entry) &&
      merged[fileId] !== undefined &&
      !isBlankFileEntry(merged[fileId])
    ) {
      continue;
    }
    merged[fileId] = entry;
  }
  return merged;
};

// Thrown (and recognized by identity or message) when the version-guarded
// write loses to a concurrent save. Callers translate it to HTTP 409.
export const versionConflictError = new Error("VERSION_CONFLICT");

export const isVersionConflict = (error: unknown): boolean =>
  error === versionConflictError ||
  (error instanceof Error && error.message === versionConflictError.message);

export type DrawingRow = NonNullable<
  Awaited<ReturnType<PrismaClient["drawing"]["findUnique"]>>
>;

export type SceneMutation = {
  // Prisma update fields to write (elements/appState/preview/name/collection…),
  // WITHOUT `version` (owned here) and WITHOUT `files` (union-merged here).
  data: Prisma.DrawingUpdateInput;
  // Already-processed (interned/sanitized) files to union-merge into the
  // authoritative current files. `undefined` leaves files untouched.
  incomingFiles?: Record<string, unknown>;
};

export type ApplySceneUpdateArgs = {
  prisma: PrismaClient;
  drawingId: string;
  parseJsonField: <T>(raw: string | null | undefined, fallback: T) => T;
  // Version-guard policy for the write:
  //  - number: client-supplied optimistic concurrency. Require the current
  //    version to equal it; conflict is terminal (no retry).
  //  - "optimistic": guard on the version read inside the tx and retry on
  //    conflict (server-owned batches such as the agent ops applier).
  //  - "none": guard on id only (last-write-wins).
  versionGuard: number | "optimistic" | "none";
  // Retries only apply to the "optimistic" guard.
  maxRetries?: number;
  // Produces the next scene from the authoritative current row. Runs inside
  // the transaction so it always sees committed state.
  mutate: (current: DrawingRow) => SceneMutation | Promise<SceneMutation>;
};

export type ApplySceneUpdateResult = {
  drawing: DrawingRow;
  // The pre-batch version whose full state was just written to DrawingSnapshot
  // (the revert target for undo).
  revertVersion: number;
};

/**
 * The shared scene-update transaction used by both PUT /drawings/:id and the
 * agent ops applier. It (a) re-reads authoritative current state inside the
 * tx, (b) writes a DrawingSnapshot of the pre-update state, (c) union-merges
 * files, (d) updateMany guarded by version for optimistic concurrency, and
 * (e) bumps version. Extracted verbatim from the PUT handler so sanitization,
 * versioning, and snapshots stay identical across a normal save and an
 * agent-applied batch.
 */
export const applySceneUpdateTx = async (
  args: ApplySceneUpdateArgs,
): Promise<ApplySceneUpdateResult> => {
  const {
    prisma,
    drawingId,
    parseJsonField,
    versionGuard,
    mutate,
    maxRetries = 0,
  } = args;

  const attempts = versionGuard === "optimistic" ? maxRetries + 1 : 1;

  let lastConflict: unknown = versionConflictError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const current = await tx.drawing.findUnique({ where: { id: drawingId } });
        if (!current) {
          throw versionConflictError;
        }

        if (typeof versionGuard === "number" && current.version !== versionGuard) {
          throw versionConflictError;
        }

        const mutation = await mutate(current);

        await tx.drawingSnapshot.create({
          data: {
            drawingId,
            version: current.version,
            elements: current.elements,
            appState: current.appState,
            files: current.files,
          },
        });

        const writeData: Prisma.DrawingUpdateInput = {
          ...mutation.data,
          version: { increment: 1 },
        };

        if (mutation.incomingFiles !== undefined) {
          const existingFiles = parseJsonField<Record<string, unknown>>(
            current.files,
            {},
          );
          writeData.files = JSON.stringify(
            mergeFilesUnion(existingFiles, mutation.incomingFiles),
          );
        }

        const where: Prisma.DrawingWhereInput = { id: drawingId };
        if (typeof versionGuard === "number") {
          where.version = versionGuard;
        } else if (versionGuard === "optimistic") {
          where.version = current.version;
        }

        const updateResult = await tx.drawing.updateMany({ where, data: writeData });
        if (updateResult.count === 0) {
          throw versionConflictError;
        }

        const updated = await tx.drawing.findFirst({ where: { id: drawingId } });
        if (!updated) {
          throw versionConflictError;
        }
        return { drawing: updated, revertVersion: current.version };
      });
    } catch (error) {
      if (isVersionConflict(error) && attempt < attempts - 1) {
        lastConflict = error;
        continue;
      }
      throw error;
    }
  }
  throw lastConflict;
};
