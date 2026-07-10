import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { isFileUploadSupported, uploadDrawingFile } from "../../api";
import { compressExcalidrawFiles } from "../../utils/imageCompression";
import type { UploadedFileRefs } from "./shared";

// How often (ms) we sweep the live file set for freshly inserted images that
// still need uploading. A short interval keeps the first metadata-only scene
// save close behind the insert; the addFiles patch also calls scanNow directly
// for programmatic/drag inserts so uploads usually start before the poll ticks.
const SCAN_INTERVAL_MS = 800;
const UPLOAD_CONCURRENCY = 3;
const UPLOAD_ATTEMPTS = 2;

type UseEditorFileUploadsParams = {
  drawingId: string | undefined;
  isReady: boolean;
  excalidrawAPI: MutableRefObject<any>;
  isSyncing: MutableRefObject<boolean>;
  latestFiles: MutableRefObject<any>;
  uploadedRefs: MutableRefObject<UploadedFileRefs>;
};

/** Decode a base64/plain `data:` URL into raw bytes plus its declared MIME. */
const dataUrlToBytes = (
  dataURL: string,
): { bytes: Uint8Array; mimeType: string } | null => {
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(dataURL);
  if (!match) return null;
  const mimeType = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const payload = match[3];
  try {
    if (isBase64) {
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return { bytes, mimeType };
    }
    return { bytes: new TextEncoder().encode(decodeURIComponent(payload)), mimeType };
  } catch {
    return null;
  }
};

/** Run task factories with a bounded number in flight at once. */
const runWithConcurrency = async (
  tasks: Array<() => Promise<void>>,
  limit: number,
): Promise<void> => {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor++];
      await task();
    }
  });
  await Promise.all(workers);
};

/**
 * Watches the drawing's file set and uploads each newly inserted image to the
 * per-file endpoint (compressing first, exactly as the save path does, so the
 * stored bytes match). Successful uploads are recorded in `uploadedRefs`, which
 * the persistence / broadcast / keepalive paths use to swap the inline dataURL
 * for a small `/api/files/...` ref. Uploads are idempotent and content-keyed,
 * so a duplicate scan is a cheap no-op. Against an older backend the capability
 * flag flips off after the first 404/501 and this hook becomes inert.
 */
export const useEditorFileUploads = ({
  drawingId,
  isReady,
  excalidrawAPI,
  isSyncing,
  latestFiles,
  uploadedRefs,
}: UseEditorFileUploadsParams) => {
  const inFlightRef = useRef<Set<string>>(new Set());

  const scanNow = useCallback(async () => {
    if (!drawingId || !isFileUploadSupported()) return;
    const editor = excalidrawAPI.current;
    const files = (editor?.getFiles?.() ||
      latestFiles.current ||
      {}) as Record<string, any>;

    const candidateIds = Object.keys(files).filter((id) => {
      const file = files[id];
      return (
        file &&
        typeof file.dataURL === "string" &&
        file.dataURL.startsWith("data:") &&
        !uploadedRefs.current[id] &&
        !inFlightRef.current.has(id)
      );
    });
    if (candidateIds.length === 0) return;
    candidateIds.forEach((id) => inFlightRef.current.add(id));

    // Compress (idempotent/memoized) and write the result back into the editor
    // so the uploaded bytes are the same ones later saves and previews use.
    let filesToUpload = files;
    try {
      const compressed = await compressExcalidrawFiles(files);
      if (compressed.changed) {
        filesToUpload = compressed.files;
        if (editor && typeof editor.addFiles === "function") {
          isSyncing.current = true;
          try {
            editor.addFiles(Object.values(filesToUpload));
          } finally {
            isSyncing.current = false;
          }
        }
        latestFiles.current = filesToUpload;
      }
    } catch {
      // Keep original bytes on compression failure; upload proceeds below.
    }

    const uploadOne = async (id: string): Promise<void> => {
      const file = filesToUpload[id];
      const dataURL = file?.dataURL;
      if (typeof dataURL !== "string" || !dataURL.startsWith("data:")) {
        inFlightRef.current.delete(id);
        return;
      }
      const parsed = dataUrlToBytes(dataURL);
      if (!parsed) {
        inFlightRef.current.delete(id);
        return;
      }
      for (let attempt = 0; attempt < UPLOAD_ATTEMPTS; attempt++) {
        try {
          const result = await uploadDrawingFile(
            drawingId,
            id,
            parsed.bytes,
            (typeof file?.mimeType === "string" && file.mimeType) ||
              parsed.mimeType,
          );
          // null => backend lacks the endpoint; stop trying for the session.
          if (result) uploadedRefs.current[id] = result.url;
          inFlightRef.current.delete(id);
          return;
        } catch {
          if (attempt === UPLOAD_ATTEMPTS - 1) {
            // Give up for now; a later scan retries (server interns meanwhile).
            inFlightRef.current.delete(id);
          }
        }
      }
    };

    await runWithConcurrency(
      candidateIds.map((id) => () => uploadOne(id)),
      UPLOAD_CONCURRENCY,
    );
  }, [drawingId, excalidrawAPI, isSyncing, latestFiles, uploadedRefs]);

  useEffect(() => {
    if (!drawingId || !isReady) return;
    const interval = window.setInterval(() => {
      void scanNow();
    }, SCAN_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [drawingId, isReady, scanNow]);

  return { scanNow };
};
