/**
 * S3-mode file rehydration.
 *
 * In S3 storage mode a drawing's `files[fileId].dataURL` is not an inline
 * base64 `data:` URL but a stored reference — either a same-origin
 * `/api/files/<drawingId>/<fileId>` redirect endpoint or a public S3 URL.
 * Excalidraw can sometimes render a raster `<img>` from such a URL, but SVG
 * image elements fail to render and, more importantly, `exportToSvg` embeds
 * the bare reference as the `<image href>` so dashboard thumbnails lose every
 * image (the preview sanitizer drops non-`data:` hrefs).
 *
 * The fix is to fetch each referenced file and re-inline it as a base64
 * `data:` URL before the files reach Excalidraw — on scene load and on socket
 * file receipt. In non-S3 mode every dataURL is already a `data:` URL, so
 * {@link filesNeedRehydration} short-circuits and nothing is fetched.
 */

/**
 * A dataURL value that must be fetched and re-inlined: a non-empty string that
 * is not already an inline `data:` URL and points at our file endpoint or an
 * absolute http(s) URL (public S3).
 */
const isRehydratableRef = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  !value.startsWith("data:") &&
  (value.startsWith("/api/files/") || /^https?:\/\//i.test(value));

export const filesNeedRehydration = (
  files: Record<string, any> | null | undefined,
): boolean => {
  if (!files || typeof files !== "object") return false;
  return Object.values(files).some((file) =>
    isRehydratableRef((file as any)?.dataURL),
  );
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });

/**
 * Fetch a stored file reference and return it as a base64 `data:` URL, or null
 * on any failure (network error, non-2xx, unreadable body). Best-effort: a
 * failed fetch must leave the original reference untouched rather than blank
 * the image.
 */
const fetchAsDataUrl = async (
  url: string,
  mimeType: unknown,
): Promise<string | null> => {
  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) return null;
    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);
    // When the response has no (or a generic) Content-Type the resulting MIME
    // is empty / application/octet-stream, which Excalidraw cannot decode as an
    // image. Repair it from the file's declared image mimeType when we have one.
    const producedMime = /^data:([^;,]*)[;,]/.exec(dataUrl)?.[1] ?? "";
    if (
      !/^image\//i.test(producedMime) &&
      typeof mimeType === "string" &&
      /^image\//i.test(mimeType)
    ) {
      return dataUrl.replace(/^data:[^;,]*(;base64,)/i, `data:${mimeType}$1`);
    }
    return dataUrl;
  } catch {
    return null;
  }
};

/**
 * Return a copy of `files` with every stored reference re-inlined as a base64
 * `data:` URL. Files that are already inline, or whose fetch fails, are kept
 * verbatim. Returns the input unchanged when nothing needs rehydrating.
 *
 * This awaits every fetch before resolving — used by socket-receipt callers
 * that need the whole batch inlined before merging it into the scene. For the
 * scene-load path prefer {@link rehydrateFilesProgressive}, which paints first
 * and streams each file into the canvas as it lands.
 */
export const rehydrateFilesFromUrls = async (
  files: Record<string, any> | null | undefined,
): Promise<Record<string, any>> => {
  if (!files || typeof files !== "object") return files ?? {};
  if (!filesNeedRehydration(files)) return files;

  const result: Record<string, any> = { ...files };
  const entries = Object.entries(files).filter(([, file]) =>
    isRehydratableRef((file as any)?.dataURL),
  );

  await Promise.all(
    entries.map(async ([fileId, file]) => {
      const dataURL = await fetchAsDataUrl(
        (file as any).dataURL,
        (file as any)?.mimeType,
      );
      if (dataURL) {
        result[fileId] = { ...(file as any), dataURL };
      }
    }),
  );

  return result;
};

/**
 * Bound on concurrent file fetches — matches the ~6 parallel connections a
 * browser opens per origin so we saturate the pipe without head-of-line
 * blocking behind a single slow blob.
 */
const REHYDRATE_CONCURRENCY = 6;

/**
 * Progressive variant of {@link rehydrateFilesFromUrls}: instead of awaiting
 * the whole batch, it fetches each stored reference with bounded concurrency
 * and invokes `onFileReady(fileId, hydratedFile)` the moment that file lands.
 * This lets the scene paint immediately and stream images into the canvas one
 * by one.
 *
 * - Inline (`data:`) entries are skipped — they already render.
 * - A file whose fetch fails is dropped silently (no callback), leaving the
 *   original reference on the canvas rather than blanking the image.
 * - `isCancelled` is polled before dispatching each fetch and again before
 *   each callback, so a stale load aborts without touching the new scene.
 */
export const rehydrateFilesProgressive = async (
  files: Record<string, any> | null | undefined,
  onFileReady: (fileId: string, file: Record<string, any>) => void,
  isCancelled?: () => boolean,
): Promise<void> => {
  if (!files || typeof files !== "object") return;
  const entries = Object.entries(files).filter(([, file]) =>
    isRehydratableRef((file as any)?.dataURL),
  );
  if (entries.length === 0) return;

  let cursor = 0;
  const worker = async () => {
    while (cursor < entries.length) {
      if (isCancelled?.()) return;
      const [fileId, file] = entries[cursor++];
      const dataURL = await fetchAsDataUrl(
        (file as any).dataURL,
        (file as any)?.mimeType,
      );
      if (isCancelled?.()) return;
      if (dataURL) {
        onFileReady(fileId, { ...(file as any), dataURL });
      }
    }
  };

  const workerCount = Math.min(REHYDRATE_CONCURRENCY, entries.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
};
