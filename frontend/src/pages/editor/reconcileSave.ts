import type { MutableRefObject } from "react";
import * as api from "../../api";
import { reconcileElements } from "../../utils/sync";

type ReconcileRefs = {
  currentDrawingVersion: MutableRefObject<number | null>;
  excalidrawAPI: MutableRefObject<any>;
  isSyncing: MutableRefObject<boolean>;
  latestElements: MutableRefObject<readonly any[]>;
  latestFiles: MutableRefObject<any>;
  lastSyncedFiles: MutableRefObject<Record<string, any>>;
};

/**
 * On a save version conflict, reload the authoritative server scene and merge
 * it with the local edits (reconcileElements + a files union) rather than
 * blindly re-sending stale state over a newer version — the old blind retry
 * could clobber another client's concurrent work. The merged scene is pushed
 * back into the live editor so what the user sees matches what gets saved.
 */
export const reloadAndReconcile = async (
  refs: ReconcileRefs,
  drawingId: string,
  localElements: readonly any[],
  localFiles: Record<string, any>,
): Promise<{ elements: readonly any[]; files: Record<string, any> }> => {
  const remote = await api.getDrawing(drawingId);
  const remoteElements = Array.isArray(remote.elements) ? remote.elements : [];
  const remoteFiles = (remote.files as Record<string, any> | undefined) || {};
  const mergedElements = reconcileElements(
    Array.from(localElements),
    remoteElements,
  );
  const mergedFiles = { ...remoteFiles, ...localFiles };
  if (typeof remote.version === "number") {
    refs.currentDrawingVersion.current = remote.version;
  }
  const editor = refs.excalidrawAPI.current;
  if (editor) {
    refs.isSyncing.current = true;
    try {
      if (typeof editor.addFiles === "function") {
        editor.addFiles(Object.values(mergedFiles));
      }
      if (typeof editor.updateScene === "function") {
        editor.updateScene({ elements: mergedElements });
      }
    } finally {
      refs.isSyncing.current = false;
    }
  }
  refs.latestElements.current = mergedElements;
  refs.latestFiles.current = mergedFiles;
  refs.lastSyncedFiles.current = mergedFiles;
  return { elements: mergedElements, files: mergedFiles };
};
