import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { toast } from "sonner";
import {
  getFileUploadMaxBytes,
  isAxiosError,
  isFileUploadSupported,
  uploadDrawingFile,
} from "../../api";
import {
  compressExcalidrawFiles,
  compressImageToFit,
  isAnimatedImageDataUrl,
} from "../../utils/imageCompression";
import type { UploadedFileRefs } from "./shared";

// How often (ms) we sweep the live file set for freshly inserted images that
// still need uploading. A short interval keeps the first metadata-only scene
// save close behind the insert; the addFiles patch also calls scanNow directly
// for programmatic/drag inserts so uploads usually start before the poll ticks.
const SCAN_INTERVAL_MS = 800;
const UPLOAD_CONCURRENCY = 3;
const UPLOAD_ATTEMPTS = 2;

const formatMegabytes = (bytes: number): string =>
  `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;

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
  // Do not retry an image that has already exhausted the fit-to-limit pass on
  // every polling tick; it remains visible so the user can replace it.
  const rejectedDataUrlsRef = useRef<Set<string>>(new Set());

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
        !inFlightRef.current.has(id) &&
        !rejectedDataUrlsRef.current.has(file.dataURL)
      );
    });
    if (candidateIds.length === 0) return;
    candidateIds.forEach((id) => inFlightRef.current.add(id));
    // Newer backends expose their existing FILE_UPLOAD_MAX_MB setting here.
    // An older/unreachable backend simply skips the targeted fit pass.
    const uploadMaxBytes = await getFileUploadMaxBytes();

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
      let file = filesToUpload[id];
      let dataURL = file?.dataURL;
      if (typeof dataURL !== "string" || !dataURL.startsWith("data:")) {
        inFlightRef.current.delete(id);
        return;
      }
      let parsed = dataUrlToBytes(dataURL);
      if (!parsed) {
        inFlightRef.current.delete(id);
        return;
      }

      if (uploadMaxBytes && parsed.bytes.byteLength > uploadMaxBytes) {
        try {
          const fitted = await compressImageToFit({
            dataURL,
            mimeType: (typeof file?.mimeType === "string" && file.mimeType) || parsed.mimeType,
            maxBytes: uploadMaxBytes,
          });
          if (fitted.changed) {
            dataURL = fitted.dataURL;
            file = { ...file, dataURL, mimeType: fitted.mimeType };
            filesToUpload = { ...filesToUpload, [id]: file };
            parsed = dataUrlToBytes(dataURL);
            if (editor && typeof editor.addFiles === "function") {
              isSyncing.current = true;
              try {
                editor.addFiles([file]);
              } finally {
                isSyncing.current = false;
              }
            }
            latestFiles.current = filesToUpload;
          }
        } catch {
          // The normal upload below remains the fallback when browser encoding fails.
        }
        if (!parsed || parsed.bytes.byteLength > uploadMaxBytes) {
          rejectedDataUrlsRef.current.add(dataURL);
          const animated = isAnimatedImageDataUrl(
            dataURL,
            (typeof file?.mimeType === "string" && file.mimeType) || parsed?.mimeType || "",
          );
          toast.error(
            animated
              ? `This animated image is larger than the ${formatMegabytes(uploadMaxBytes)} server safety limit. Animation was preserved; ask an administrator to raise FILE_UPLOAD_MAX_MB.`
              : `This image cannot be compressed below the ${formatMegabytes(uploadMaxBytes)} server safety limit. Choose a smaller image or ask an administrator to raise FILE_UPLOAD_MAX_MB.`,
          );
          inFlightRef.current.delete(id);
          return;
        }
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
        } catch (error) {
          if (isAxiosError(error) && error.response?.status === 413) {
            rejectedDataUrlsRef.current.add(dataURL);
            toast.error(
              "The server rejected this image as too large. Choose a smaller image or ask an administrator to raise FILE_UPLOAD_MAX_MB.",
            );
            inFlightRef.current.delete(id);
            return;
          }
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
