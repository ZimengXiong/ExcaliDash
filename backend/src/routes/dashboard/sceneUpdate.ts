import { storedFileFilter } from "../../drawingFileStore";
import { Prisma, PrismaClient } from "../../generated/client";
import { encodeSnapshotFieldAsync } from "../../snapshots/snapshotCodec";

// A file entry is "blank" when it exists but carries no content (empty
// dataURL). Sanitizer tombstones and transient client state can produce
// these; they must never overwrite an existing entry that still has content.
const isBlankFileEntry = (entry: unknown): boolean => {
  if (!entry || typeof entry !== "object") return true;
  const dataURL = (entry as { dataURL?: unknown }).dataURL;
  return typeof dataURL !== "string" || dataURL.length === 0;
};

// Merge incoming files into the existing set by fileId (union). Removal is
// never performed here — only the trim/orphans routes delete files — so a
// save from a client with a partial/stale view of the files object cannot
// delete another client's images. Same-id updates overwrite, except a blank
// incoming entry never clobbers existing content.
const mergeFilesUnion = (
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

// Live (non-deleted) element count per drawing at a committed version, so
// the coalescing check below normally avoids parsing the stored scene.
// Process-local and advisory: a miss just falls back to parsing.
const liveCountCache = new Map<string, { version: number; live: number }>();
const LIVE_COUNT_CACHE_MAX = 500;

export const countLiveElements = (elements: unknown): number =>
  Array.isArray(elements)
    ? elements.filter(
        (element) =>
          element &&
          typeof element === "object" &&
          (element as { isDeleted?: unknown }).isDeleted !== true,
      ).length
    : 0;

const rememberLiveCount = (
  drawingId: string,
  version: number,
  live: number,
) => {
  if (liveCountCache.size >= LIVE_COUNT_CACHE_MAX) {
    const oldest = liveCountCache.keys().next().value;
    if (oldest !== undefined) liveCountCache.delete(oldest);
  }
  liveCountCache.delete(drawingId);
  liveCountCache.set(drawingId, { version, live });
};

const storedLiveCount = (
  drawingId: string,
  version: number,
  elementsJson: string,
): number => {
  const cached = liveCountCache.get(drawingId);
  if (cached && cached.version === version) return cached.live;
  try {
    return countLiveElements(JSON.parse(elementsJson));
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

// A save retaining fewer than 90% of live elements always gets a snapshot.
const MIN_LIVE_ELEMENT_RATIO = 0.9;

// Thrown (and recognized by identity or message) when the version-guarded
// write loses to a concurrent save. Callers translate it to HTTP 409.
const versionConflictError = new Error("VERSION_CONFLICT");

export const isVersionConflict = (error: unknown): boolean =>
  error === versionConflictError ||
  (error instanceof Error && error.message === versionConflictError.message);

type DrawingRow = NonNullable<
  Awaited<ReturnType<PrismaClient["drawing"]["findUnique"]>>
>;

// The pre-update state needed for the history snapshot. Deliberately excludes
// `preview`, which for image-heavy drawings can be larger than the scene.
const CURRENT_SELECT = {
  version: true,
  elements: true,
  appState: true,
  files: true,
} as const;
type CurrentScene = Pick<
  DrawingRow,
  "version" | "elements" | "appState" | "files"
>;

// Row returned after the write. Callers that only need the new version pass a
// narrow select; the default keeps the full row for response compatibility.
type ResultRow = Pick<DrawingRow, "id" | "version" | "updatedAt"> &
  Partial<DrawingRow>;

type SceneMutation = {
  // Prisma update fields to write (elements/appState/preview/name/collection…),
  // WITHOUT `version` (owned here). Saves pass files through incomingFiles for
  // union merging; history restores may replace files explicitly in data.
  data: Prisma.DrawingUpdateInput;
  // Already-processed (interned/sanitized) files to union-merge into the
  // authoritative current files. `undefined` leaves files untouched.
  incomingFiles?: Record<string, unknown>;
  // Interned/managed references must still have their bytes when the scene
  // commits. Storage cleanup may have reclaimed them since interning ran.
  requiredFileIds?: string[];
};

type ApplySceneUpdateArgs = {
  prisma: PrismaClient;
  drawingId: string;
  parseJsonField: <T>(raw: string | null | undefined, fallback: T) => T;
  versionGuard: number | "optimistic";
  snapshotCompressionEnabled?: boolean;
  maxRetries?: number;
  mutate: () => SceneMutation | Promise<SceneMutation>;
  resultSelect?: Prisma.DrawingSelect;
  // Autosave coalescing. Without it (history restore, imports) every update
  // snapshots the previous state.
  snapshotCoalescing?: {
    minIntervalMs: number;
    // Live elements in the incoming scene; undefined when elements are not
    // being replaced (files/appState-only saves).
    incomingLiveCount?: number;
  };
};

type ApplySceneUpdateResult = {
  drawing: ResultRow;
  revertVersion: number;
  // Committed scene fields, including those the transaction left unchanged.
  scene: Omit<CurrentScene, "version">;
};

export const applySceneUpdateTx = async (
  args: ApplySceneUpdateArgs,
): Promise<ApplySceneUpdateResult> => {
  const {
    prisma,
    drawingId,
    parseJsonField,
    versionGuard,
    snapshotCompressionEnabled = true,
    mutate,
    maxRetries = 0,
    resultSelect,
    snapshotCoalescing,
  } = args;

  const attempts = versionGuard === "optimistic" ? maxRetries + 1 : 1;

  let lastConflict: unknown = versionConflictError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const current = await tx.drawing.findUnique({
          where: { id: drawingId },
          select: CURRENT_SELECT,
        });
        if (!current) {
          throw versionConflictError;
        }

        if (
          typeof versionGuard === "number" &&
          current.version !== versionGuard
        ) {
          throw versionConflictError;
        }

        const mutation = await mutate();

        if (mutation.requiredFileIds?.length) {
          const requiredIds = new Set(mutation.requiredFileIds);
          const stored = await tx.drawingFile.findMany({
            where: {
              drawingId,
              fileId: { in: [...requiredIds] },
              ...storedFileFilter,
            },
            select: { fileId: true },
          });
          if (stored.length !== requiredIds.size) {
            throw versionConflictError;
          }
        }

        // Autosave runs about once a second while someone edits. A full
        // compressed copy of a large scene per save cost CPU and grew the
        // database by gigabytes per editing hour, so ordinary saves reuse a
        // snapshot younger than the interval. Saves that remove many live
        // elements still snapshot, so an accidental wipe stays restorable.
        let takeSnapshot = true;
        if (snapshotCoalescing && snapshotCoalescing.minIntervalMs > 0) {
          const now = Date.now();
          const recentSnapshot = await tx.drawingSnapshot.findFirst({
            where: {
              drawingId,
              createdAt: {
                gte: new Date(now - snapshotCoalescing.minIntervalMs),
                lte: new Date(now),
              },
            },
            select: { id: true },
          });
          if (recentSnapshot) {
            const incoming = snapshotCoalescing.incomingLiveCount;
            takeSnapshot =
              incoming !== undefined &&
              incoming <
                storedLiveCount(drawingId, current.version, current.elements) *
                  MIN_LIVE_ELEMENT_RATIO;
          }
        }

        if (takeSnapshot) {
          // Compress on the libuv pool: synchronous brotli of a large scene
          // blocked every other request for hundreds of milliseconds per save.
          const [snapElements, snapAppState, snapFiles] = await Promise.all([
            encodeSnapshotFieldAsync(
              current.elements,
              snapshotCompressionEnabled,
            ),
            encodeSnapshotFieldAsync(
              current.appState,
              snapshotCompressionEnabled,
            ),
            encodeSnapshotFieldAsync(current.files, snapshotCompressionEnabled),
          ]);
          await tx.drawingSnapshot.create({
            select: { id: true },
            data: {
              drawingId,
              version: current.version,
              elements: snapElements,
              appState: snapAppState,
              files: snapFiles,
            },
          });
        }

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
        } else {
          where.version = current.version;
        }

        const updateResult = await tx.drawing.updateMany({
          where,
          data: writeData,
        });
        if (updateResult.count === 0) {
          throw versionConflictError;
        }

        const updated = (await tx.drawing.findFirst({
          where: { id: drawingId },
          ...(resultSelect ? { select: resultSelect } : {}),
        })) as ResultRow | null;
        if (!updated) {
          throw versionConflictError;
        }
        return {
          drawing: updated,
          revertVersion: current.version,
          scene: {
            elements:
              updated.elements ??
              (typeof writeData.elements === "string"
                ? writeData.elements
                : (writeData.elements?.set ?? current.elements)),
            appState:
              updated.appState ??
              (typeof writeData.appState === "string"
                ? writeData.appState
                : (writeData.appState?.set ?? current.appState)),
            files:
              updated.files ??
              (typeof writeData.files === "string"
                ? writeData.files
                : (writeData.files?.set ?? current.files)),
          },
        };
      });
      if (snapshotCoalescing?.incomingLiveCount !== undefined) {
        rememberLiveCount(
          drawingId,
          result.drawing.version,
          snapshotCoalescing.incomingLiveCount,
        );
      }
      return result;
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
