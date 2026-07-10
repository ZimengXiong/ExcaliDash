import { applyElementOrder, reconcileElements } from "../../utils/sync";

export interface ElementVersionInfo {
  version: number;
  versionNonce: number;
  updated: number;
  contentSig: string;
}

const toFiniteNumber = (value: any): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const getElementContentSig = (element: any): string => {
  if (!element || typeof element !== "object") return "";
  const type = typeof element.type === "string" ? element.type : "";
  const isDeleted = element.isDeleted ? "1" : "0";
  const status = typeof element.status === "string" ? element.status : "";
  const x = toFiniteNumber(element.x);
  const y = toFiniteNumber(element.y);
  const w = toFiniteNumber(element.width);
  const h = toFiniteNumber(element.height);
  const angle = toFiniteNumber(element.angle);
  const fileId = typeof element.fileId === "string" ? element.fileId : "";
  const text = typeof element.text === "string" ? element.text : "";
  const textSig = text ? `t${text.length}:${text.slice(0, 64)}` : "";
  let pointsSig = "";
  if (Array.isArray(element.points)) {
    const pts = element.points as any[];
    const len = pts.length;
    const last = len > 0 ? pts[len - 1] : null;
    const lastX = Array.isArray(last) ? toFiniteNumber(last[0]) : 0;
    const lastY = Array.isArray(last) ? toFiniteNumber(last[1]) : 0;
    pointsSig = `p${len}:${lastX},${lastY}`;
  }
  return `${type}|${isDeleted}|${status}|${x}|${y}|${w}|${h}|${angle}|${pointsSig}|${fileId}|${textSig}`;
};

/**
 * Matches CaptureUpdateAction.{NEVER,IMMEDIATELY} from @excalidraw/excalidraw.
 * Kept as local constants so that shared.ts doesn't pull in the full excalidraw
 * UI bundle, which breaks jsdom-based unit tests. The enum values are the
 * literal strings "NEVER" / "IMMEDIATELY" (see store.d.ts).
 */
const CAPTURE_UPDATE_NEVER = "NEVER" as const;
const CAPTURE_UPDATE_IMMEDIATELY = "IMMEDIATELY" as const;

export type CaptureMode =
  | typeof CAPTURE_UPDATE_NEVER
  | typeof CAPTURE_UPDATE_IMMEDIATELY;

type RemoteSceneUpdate =
  | {
      collaborators: Map<string, any>;
      captureUpdate: CaptureMode;
    }
  | {
      elements: any[];
      files?: Record<string, any>;
      captureUpdate: CaptureMode;
    }
  | {
      files: Record<string, any>;
      captureUpdate: CaptureMode;
    };

type BuildRemoteSceneUpdateInput = {
  collaborators?: Map<string, any>;
  localElements?: readonly any[];
  pendingElements?: readonly any[];
  elementOrder?: readonly string[] | null;
  lastSyncedFiles?: Record<string, any>;
  incomingFiles?: Record<string, any>;
  /**
   * Undo-stack behavior for element updates. Remote peer edits default to
   * NEVER (not locally undoable); a self-originated agent batch replayed to the
   * requesting editor passes IMMEDIATELY so native Ctrl+Z works (D5).
   */
  captureUpdate?: CaptureMode;
};

export const getPersistedAppState = (appState: Record<string, any> | null | undefined) => {
  const base: Record<string, any> = {
    viewBackgroundColor: appState?.viewBackgroundColor ?? "#ffffff",
    gridSize: appState?.gridSize ?? null,
  };
  if (appState?.gridStep != null) base.gridStep = appState.gridStep;
  if (appState?.gridModeEnabled != null) base.gridModeEnabled = appState.gridModeEnabled;
  return base;
};

export const buildRemoteSceneUpdate = ({
  collaborators,
  localElements = [],
  pendingElements = [],
  elementOrder = null,
  lastSyncedFiles = {},
  incomingFiles = {},
  captureUpdate = CAPTURE_UPDATE_NEVER,
}: BuildRemoteSceneUpdateInput): {
  sceneUpdate: RemoteSceneUpdate | null;
  mergedElements: any[] | null;
  nextFiles: Record<string, any>;
  shouldUpdateFiles: boolean;
} => {
  if (collaborators) {
    return {
      sceneUpdate: {
        collaborators,
        captureUpdate: CAPTURE_UPDATE_NEVER,
      },
      mergedElements: null,
      nextFiles: lastSyncedFiles,
      shouldUpdateFiles: false,
    };
  }

  const shouldUpdateFiles = Object.keys(incomingFiles).length > 0;
  const nextFiles = shouldUpdateFiles
    ? { ...lastSyncedFiles, ...incomingFiles }
    : lastSyncedFiles;
  const hasElementOrder = Array.isArray(elementOrder) && elementOrder.length > 0;
  const shouldUpdateElements = pendingElements.length > 0 || hasElementOrder;

  if (shouldUpdateElements) {
    let mergedElements = reconcileElements(localElements, pendingElements);
    if (hasElementOrder) {
      mergedElements = applyElementOrder(mergedElements, elementOrder);
    }

    return {
      sceneUpdate: {
        elements: mergedElements,
        ...(shouldUpdateFiles ? { files: nextFiles } : {}),
        captureUpdate,
      },
      mergedElements,
      nextFiles,
      shouldUpdateFiles,
    };
  }

  if (shouldUpdateFiles) {
    return {
      sceneUpdate: {
        files: nextFiles,
        captureUpdate: CAPTURE_UPDATE_NEVER,
      },
      mergedElements: null,
      nextFiles,
      shouldUpdateFiles,
    };
  }

  return {
    sceneUpdate: null,
    mergedElements: null,
    nextFiles,
    shouldUpdateFiles,
  };
};

export const haveSameElements = (a: readonly any[] = [], b: readonly any[] = []) => {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (!left || !right) return false;
    if (left.id !== right.id) return false;
    if ((left.version ?? 0) !== (right.version ?? 0)) return false;
    if ((left.versionNonce ?? 0) !== (right.versionNonce ?? 0)) return false;
    // Some Excalidraw interactions (notably drag/resize) can update geometry while
    // keeping version/versionNonce stable until commit; `updated` catches those frames.
    const leftUpdated = typeof left.updated === "number" ? left.updated : Number(left.updated) || 0;
    const rightUpdated =
      typeof right.updated === "number" ? right.updated : Number(right.updated) || 0;
    if (leftUpdated !== rightUpdated) return false;
  }
  return true;
};

export const hasRenderableElements = (elements: readonly any[] = []): boolean =>
  elements.some((element: any) => !element?.isDeleted);

/**
 * Guard against transient empty snapshots (e.g. hydration/reload races) from
 * overwriting a previously persisted non-empty drawing.
 */
export const isSuspiciousEmptySnapshot = (
  previousPersisted: readonly any[] = [],
  nextSnapshot: readonly any[] = []
): boolean => {
  if (!Array.isArray(nextSnapshot) || nextSnapshot.length > 0) return false;
  return hasRenderableElements(previousPersisted);
};

/**
 * Detects a stale empty snapshot that is older than the current in-memory scene.
 * This prevents race conditions where an outdated empty `onChange` event can
 * overwrite a newer non-empty scene.
 */
export const isStaleEmptySnapshot = (
  latestSnapshot: readonly any[] = [],
  candidateSnapshot: readonly any[] = []
): boolean => {
  if (!Array.isArray(candidateSnapshot) || candidateSnapshot.length > 0) return false;
  if (!hasRenderableElements(latestSnapshot)) return false;
  return !haveSameElements(latestSnapshot, candidateSnapshot);
};

/**
 * Detects a stale snapshot that has no renderable elements while the latest
 * in-memory scene still has renderable content.
 *
 * This covers cases where Excalidraw emits a transient non-renderable scene
 * (e.g. hydration race) that should not overwrite newer content.
 */
export const isStaleNonRenderableSnapshot = (
  latestSnapshot: readonly any[] = [],
  candidateSnapshot: readonly any[] = []
): boolean => {
  if (!Array.isArray(candidateSnapshot)) return false;
  if (hasRenderableElements(candidateSnapshot)) return false;
  if (!hasRenderableElements(latestSnapshot)) return false;
  return !haveSameElements(latestSnapshot, candidateSnapshot);
};

const buildFileSignature = (file: any): string => {
  const mimeType = typeof file?.mimeType === "string" ? file.mimeType : "";
  const id = typeof file?.id === "string" ? file.id : "";
  const dataURL = typeof file?.dataURL === "string" ? file.dataURL : "";
  const prefix = dataURL.slice(0, 32);
  const suffix = dataURL.slice(-32);
  return `${id}|${mimeType}|${dataURL.length}|${prefix}|${suffix}`;
};

export const getFilesDelta = (
  previous: Record<string, any>,
  next: Record<string, any>
): Record<string, any> => {
  const delta: Record<string, any> = {};
  const prev = previous || {};
  const nxt = next || {};

  for (const fileId of Object.keys(nxt)) {
    const nextFile = nxt[fileId];
    const nextHasDataUrl = typeof nextFile?.dataURL === "string" && nextFile.dataURL.length > 0;
    if (!nextHasDataUrl) continue;

    const prevFile = prev[fileId];
    if (!prevFile) {
      delta[fileId] = nextFile;
      continue;
    }

    if (buildFileSignature(prevFile) !== buildFileSignature(nextFile)) {
      delta[fileId] = nextFile;
    }
  }

  return delta;
};

/**
 * Map of Excalidraw fileId → stored ref URL (`/api/files/<drawingId>/<fileId>`)
 * for images that have been uploaded out-of-band via the per-file upload
 * endpoint. Consumed by {@link applyUploadedFileRefs}.
 */
export type UploadedFileRefs = Record<string, string>;

/**
 * Replace the inline base64 dataURL of any already-uploaded file with a small
 * metadata + ref entry so scene PUTs and socket emits carry KB, not MB.
 *
 * Only entries that (a) have a recorded ref and (b) still carry an inline
 * `data:` URL are rewritten — entries not yet uploaded keep their inline bytes
 * (the server interns them, so an upload race never loses data), and entries
 * already ref-shaped pass through untouched. Returns the input unchanged when
 * nothing was substituted.
 */
export const applyUploadedFileRefs = (
  files: Record<string, any> | null | undefined,
  uploadedRefs: UploadedFileRefs | null | undefined,
): Record<string, any> => {
  if (!files || typeof files !== "object") return files ?? {};
  if (!uploadedRefs || Object.keys(uploadedRefs).length === 0) return files;

  let changed = false;
  const result: Record<string, any> = {};
  for (const [fileId, file] of Object.entries(files)) {
    const refUrl = uploadedRefs[fileId];
    const dataURL = (file as any)?.dataURL;
    if (
      refUrl &&
      file &&
      typeof dataURL === "string" &&
      dataURL.startsWith("data:")
    ) {
      changed = true;
      result[fileId] = {
        id: (file as any).id ?? fileId,
        mimeType: (file as any).mimeType,
        created: (file as any).created,
        lastRetrieved: (file as any).lastRetrieved ?? Date.now(),
        dataURL: refUrl,
      };
    } else {
      result[fileId] = file;
    }
  }
  return changed ? result : files;
};

export const UIOptions = {
  canvasActions: {
    saveToActiveFile: false,
    loadScene: false,
    export: false,
    toggleTheme: true,
  },
} as const;

export { getInitialsFromName } from "../../utils/user";

export const getColorFromString = (str: string): string => {
  const COLORS = [
    "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e", "#10b981",
    "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6",
    "#a855f7", "#d946ef", "#ec4899", "#f43f5e",
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
};
