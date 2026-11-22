/**
 * Thumbnail-sized image files for preview SVGs.
 *
 * `exportToSvg` embeds every image's full dataURL, so a drawing with 20
 * screenshots produced a ~50 MB preview that was uploaded every 30 s, stored,
 * sanitized and downloaded by the dashboard. A dashboard card is a few hundred
 * pixels wide, so each image is downscaled to the size it actually occupies in
 * the thumbnail (with headroom for high-DPI screens) before export.
 *
 * Results are cached by source content and target size so the periodic
 * preview save only downsizes new or changed images.
 */

import { blobToDataUrl } from "./dataUrls";

/** Width/height in CSS pixels that the whole scene is fitted into. */
const THUMBNAIL_SCENE_PX = 1024;
const MIN_IMAGE_PX = 48;
const MAX_IMAGE_PX = 512;
/** Below this the original is already cheap; keep it untouched. */
const MIN_BYTES_TO_SHRINK = 48 * 1024;
const MAX_CACHE_ENTRIES = 256;

type FileRecord = {
  id?: string;
  dataURL?: string;
  mimeType?: string;
  [key: string]: unknown;
};

type SceneElement = {
  type?: string;
  fileId?: string | null;
  isDeleted?: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  crop?: { width?: number; naturalWidth?: number } | null;
};

const cache = new Map<string, string>();
let generation = 0;
let sourceHashes = new WeakMap<
  FileRecord,
  { dataURL: string; digest: Promise<string> }
>();

const remember = (key: string, value: string) => {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
};

export const clearPreviewThumbnailCache = () => {
  generation++;
  cache.clear();
  sourceHashes = new WeakMap();
};

export const previewThumbnailGeneration = () => generation;

export const assertCurrentPreviewThumbnailGeneration = (started: number) => {
  if (started !== generation) {
    throw new DOMException("The preview session changed", "AbortError");
  }
};

const finite = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Thumbnail pixels for `size` scene units in a scene `sceneSize` across. */
export const thumbnailTargetPx = (size: number, sceneSize: number): number => {
  const displayed = size * (THUMBNAIL_SCENE_PX / Math.max(sceneSize, 1)) * 2;
  const bucket = 2 ** Math.ceil(Math.log2(Math.max(displayed, 1)));
  return Math.min(MAX_IMAGE_PX, Math.max(MIN_IMAGE_PX, bucket));
};

/**
 * Longest on-thumbnail edge (CSS px x 2 for high-DPI) of each image file,
 * rounded up to a power of two so small layout changes reuse the cache.
 */
export const computeThumbnailTargets = (
  elements: readonly SceneElement[],
): Map<string, number> => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    if (!el || el.isDeleted) continue;
    const x = finite(el.x);
    const y = finite(el.y);
    const w = Math.abs(finite(el.width));
    const h = Math.abs(finite(el.height));
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }
  const sceneSize = Math.max(maxX - minX, maxY - minY, 1);
  const targets = new Map<string, number>();
  for (const el of elements) {
    if (!el || el.isDeleted || el.type !== "image") continue;
    if (typeof el.fileId !== "string") continue;
    // A cropped image shows only part of the bitmap at the element size, so
    // the whole bitmap needs proportionally more pixels.
    const cropZoom =
      el.crop && finite(el.crop.width) > 0
        ? Math.max(1, finite(el.crop.naturalWidth) / finite(el.crop.width, 1))
        : 1;
    const target = thumbnailTargetPx(
      Math.max(Math.abs(finite(el.width)), Math.abs(finite(el.height))) *
        cropZoom,
      sceneSize,
    );
    targets.set(el.fileId, Math.max(targets.get(el.fileId) ?? 0, target));
  }
  return targets;
};

const approxBytes = (dataURL: string) =>
  Math.floor(((dataURL.length - dataURL.indexOf(",") - 1) * 3) / 4);

const decode = (dataURL: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to decode image"));
    image.src = dataURL;
  });

const resize = async (
  image: CanvasImageSource,
  width: number,
  height: number,
  mimeType: string,
  target: number,
): Promise<string | null> => {
  const longest = Math.max(width, height);
  if (!longest || longest <= target) return null;
  const ratio = target / longest;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const format = mimeType === "image/jpeg" ? "image/jpeg" : "image/webp";
  if (typeof canvas.toBlob === "function") {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, format, 0.8),
    );
    if (blob) return blobToDataUrl(blob);
  }
  const output = canvas.toDataURL(format, 0.8);
  return output.startsWith("data:image/") ? output : null;
};

export const shrinkImageDataUrl = async (
  dataURL: string,
  mimeType: string,
  target: number,
): Promise<string | null> => {
  const image = await decode(dataURL);
  const output = await resize(
    image,
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    mimeType,
    target,
  );
  return output &&
    (mimeType === "image/svg+xml" || output.length < dataURL.length)
    ? output
    : null;
};

/** Downscale a fetched image to the requested longest edge. */
export const shrinkImageBlob = async (
  blob: Blob,
  target: number,
): Promise<string | null> => {
  const type = blob.type.toLowerCase().split(";")[0];
  if (typeof document === "undefined") return null;
  if (type === "image/gif") {
    await decode(await blobToDataUrl(blob));
    return null;
  }

  // Some browsers only decode SVGs with explicit intrinsic dimensions into
  // an ImageBitmap. An HTMLImageElement can also handle viewBox-only SVGs.
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob).catch(() => null);
    if (bitmap) {
      try {
        return await resize(bitmap, bitmap.width, bitmap.height, type, target);
      } finally {
        bitmap.close();
      }
    }
  }
  return shrinkImageDataUrl(await blobToDataUrl(blob), type, target);
};

const hashImageSource = async (dataURL: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(dataURL),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

const thumbnailCacheKey = async (
  file: FileRecord,
  dataURL: string,
  target: number,
) => {
  if (!globalThis.crypto?.subtle) return undefined;
  let source = sourceHashes.get(file);
  if (source?.dataURL !== dataURL) {
    source = { dataURL, digest: hashImageSource(dataURL) };
    sourceHashes.set(file, source);
  }
  const hash = await source.digest;
  return `${hash}@${target}`;
};

/**
 * Return a files map whose image dataURLs are reduced to thumbnail size.
 * Unreferenced files are dropped; anything that cannot be shrunk (GIF,
 * already small, decode failure, no DOM) is passed through unchanged.
 */
export const buildPreviewFiles = async (
  elements: readonly SceneElement[],
  files: Record<string, FileRecord> | null | undefined,
): Promise<Record<string, FileRecord>> => {
  const started = generation;
  const result: Record<string, FileRecord> = {};
  if (!files) return result;
  const targets = computeThumbnailTargets(elements);
  const canDraw =
    typeof document !== "undefined" && typeof Image !== "undefined";
  await Promise.all(
    [...targets].map(async ([fileId, target]) => {
      const file = files[fileId];
      if (!file) return;
      const dataURL = file.dataURL;
      const mimeType =
        typeof dataURL === "string"
          ? (/^data:([^;,]+)/i.exec(dataURL)?.[1].toLowerCase() ?? "")
          : "";
      if (
        !canDraw ||
        typeof dataURL !== "string" ||
        !dataURL.startsWith("data:image/") ||
        mimeType === "image/gif" ||
        (mimeType !== "image/svg+xml" &&
          approxBytes(dataURL) < MIN_BYTES_TO_SHRINK)
      ) {
        result[fileId] = file;
        return;
      }
      const key = await thumbnailCacheKey(file, dataURL, target).catch(
        () => undefined,
      );
      assertCurrentPreviewThumbnailGeneration(started);
      let small = key ? cache.get(key) : undefined;
      if (small === undefined) {
        small =
          (await shrinkImageDataUrl(dataURL, mimeType, target).catch(
            () => null,
          )) ?? dataURL;
        assertCurrentPreviewThumbnailGeneration(started);
        if (key && small !== dataURL) remember(key, small);
      }
      result[fileId] =
        small === dataURL
          ? file
          : {
              ...file,
              dataURL: small,
              mimeType: /^data:([^;,]+)/.exec(small)?.[1] ?? file.mimeType,
            };
    }),
  );
  assertCurrentPreviewThumbnailGeneration(started);
  return result;
};
