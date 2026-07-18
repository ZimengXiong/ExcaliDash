export type ExcalidrawFileRecord = {
  id?: string;
  dataURL?: string;
  mimeType?: string;
  created?: number;
  [key: string]: unknown;
};

export type CompressionResult = {
  dataURL: string;
  mimeType: string;
  width: number;
  height: number;
  changed: boolean;
};

const DEFAULT_MIN_DATA_URL_LENGTH = 350_000;
const DEFAULT_MAX_DIMENSION = 2800;
const DEFAULT_MIN_IMPROVEMENT_RATIO = 0.9;

const COMPRESSIBLE_MIME_PREFIX = "image/";
// Preserve formats that may carry animation or vector semantics. AVIF animation
// detection is not consistently available in browsers, so keep AVIF lossless
// rather than risk flattening it through a canvas.
const NON_COMPRESSIBLE_MIME_TYPES = new Set([
  "image/svg+xml",
  "image/gif",
  "image/avif",
]);

const isDataImageUrl = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("data:image/");

const getMimeTypeFromDataUrl = (dataURL: string): string | null => {
  const match = /^data:([^;,]+)[;,]/i.exec(dataURL);
  return match ? match[1].toLowerCase() : null;
};

const canCompressMimeType = (mimeType: string): boolean =>
  mimeType.startsWith(COMPRESSIBLE_MIME_PREFIX) &&
  !NON_COMPRESSIBLE_MIME_TYPES.has(mimeType);

const hasAsciiMarker = (dataURL: string, markers: string[]): boolean => {
  const payload = dataURL.split(",", 2)[1];
  if (!payload) return false;
  try {
    // Animation markers live near the container header. Bound decoding so a
    // very large image does not create another full-size string allocation.
    const sampleLength = Math.min(payload.length, 512 * 1024);
    const alignedLength = sampleLength - (sampleLength % 4);
    const sample = atob(payload.slice(0, alignedLength));
    return markers.some((marker) => sample.includes(marker));
  } catch {
    return false;
  }
};

export const isAnimatedImageDataUrl = (
  dataURL: string,
  mimeType: string,
): boolean => {
  const normalized = mimeType.toLowerCase();
  if (normalized === "image/gif") return true;
  if (normalized === "image/png") return hasAsciiMarker(dataURL, ["acTL"]);
  if (normalized === "image/webp") {
    return hasAsciiMarker(dataURL, ["ANIM", "ANMF"]);
  }
  if (normalized === "image/avif") return true;
  return false;
};

const loadImageFromDataUrl = (dataURL: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to decode image data"));
    image.src = dataURL;
  });

const clampDimension = (width: number, height: number, maxDimension: number) => {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const largest = Math.max(safeWidth, safeHeight);
  if (!Number.isFinite(largest) || largest <= maxDimension) {
    return { width: safeWidth, height: safeHeight };
  }

  const ratio = maxDimension / largest;
  return {
    width: Math.max(1, Math.round(safeWidth * ratio)),
    height: Math.max(1, Math.round(safeHeight * ratio)),
  };
};

const drawToCanvas = (
  image: HTMLImageElement,
  width: number,
  height: number
): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to get canvas context for image compression");
  }
  context.drawImage(image, 0, 0, width, height);
  return canvas;
};

const getTargetMimeType = (originalMimeType: string): string => {
  if (originalMimeType === "image/jpeg" || originalMimeType === "image/webp") {
    return originalMimeType;
  }
  return "image/webp";
};

const COMPRESSION_ENABLED_KEY = "excalidash-image-compression";

const isCompressionEnabled = (): boolean => {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage?.getItem?.(COMPRESSION_ENABLED_KEY);
  return raw !== "false";
};

const maybeCompressDataUrl = async (
  inputDataURL: string,
  sourceMimeType: string,
  options?: {
    minDataUrlLength?: number;
    maxDimension?: number;
    minImprovementRatio?: number;
  }
): Promise<CompressionResult> => {
  if (!isCompressionEnabled()) {
    return {
      dataURL: inputDataURL,
      mimeType: sourceMimeType,
      width: 0,
      height: 0,
      changed: false,
    };
  }

  const minDataUrlLength = options?.minDataUrlLength ?? DEFAULT_MIN_DATA_URL_LENGTH;
  const maxDimension = options?.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const minImprovementRatio = options?.minImprovementRatio ?? DEFAULT_MIN_IMPROVEMENT_RATIO;

  if (!isDataImageUrl(inputDataURL)) {
    return {
      dataURL: inputDataURL,
      mimeType: sourceMimeType,
      width: 0,
      height: 0,
      changed: false,
    };
  }

  const effectiveMimeType = (sourceMimeType || getMimeTypeFromDataUrl(inputDataURL) || "").toLowerCase();
  if (
    !canCompressMimeType(effectiveMimeType) ||
    isAnimatedImageDataUrl(inputDataURL, effectiveMimeType)
  ) {
    return {
      dataURL: inputDataURL,
      mimeType: effectiveMimeType || sourceMimeType,
      width: 0,
      height: 0,
      changed: false,
    };
  }

  if (inputDataURL.length < minDataUrlLength) {
    return {
      dataURL: inputDataURL,
      mimeType: effectiveMimeType,
      width: 0,
      height: 0,
      changed: false,
    };
  }

  const image = await loadImageFromDataUrl(inputDataURL);
  const baseWidth = image.naturalWidth || image.width || 1;
  const baseHeight = image.naturalHeight || image.height || 1;
  const { width, height } = clampDimension(baseWidth, baseHeight, maxDimension);
  const canvas = drawToCanvas(image, width, height);
  const targetMimeType = getTargetMimeType(effectiveMimeType);

  const qualityCandidates = [0.82, 0.74, 0.66, 0.58];
  let best = inputDataURL;

  for (const quality of qualityCandidates) {
    const next = canvas.toDataURL(targetMimeType, quality);
    if (next.length < best.length) {
      best = next;
    }
  }

  const improvedEnough = best.length <= Math.floor(inputDataURL.length * minImprovementRatio);
  if (!improvedEnough) {
    return {
      dataURL: inputDataURL,
      mimeType: effectiveMimeType,
      width: baseWidth,
      height: baseHeight,
      changed: false,
    };
  }

  // Trust the MIME actually encoded in the output, not the type we requested.
  // Firefox (and some other browsers) can silently fall back to PNG while
  // returning a `data:image/webp` request unchanged, so labeling the record
  // with `targetMimeType` would corrupt the stored mimeType.
  const actualMimeType = getMimeTypeFromDataUrl(best) || targetMimeType;

  return {
    dataURL: best,
    mimeType: actualMimeType,
    width,
    height,
    changed: true,
  };
};

export const compressDroppedImagePayload = async (args: {
  dataURL: string;
  mimeType: string;
}) => maybeCompressDataUrl(args.dataURL, args.mimeType);

const dataUrlByteLength = (dataURL: string): number | null => {
  const match = /^data:[^;,]+;base64,([\s\S]*)$/i.exec(dataURL);
  if (!match) return null;
  const base64 = match[1].replace(/\s/g, "");
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
};

/**
 * Make a final, progressively smaller WebP/JPEG encode when an image exceeds
 * the server's configured raw-upload cap. This intentionally runs separately
 * from the normal quality-preserving compression pass: it only trades more
 * fidelity for size after the server limit makes that necessary.
 */
export const compressImageToFit = async (args: {
  dataURL: string;
  mimeType: string;
  maxBytes: number;
}): Promise<CompressionResult> => {
  const sourceMimeType = (args.mimeType || getMimeTypeFromDataUrl(args.dataURL) || "").toLowerCase();
  const unchanged = (): CompressionResult => ({
    dataURL: args.dataURL,
    mimeType: sourceMimeType || args.mimeType,
    width: 0,
    height: 0,
    changed: false,
  });
  if (
    !isCompressionEnabled() ||
    !isDataImageUrl(args.dataURL) ||
    !canCompressMimeType(sourceMimeType) ||
    isAnimatedImageDataUrl(args.dataURL, sourceMimeType) ||
    !Number.isFinite(args.maxBytes) ||
    args.maxBytes <= 0
  ) {
    return unchanged();
  }

  const image = await loadImageFromDataUrl(args.dataURL);
  const baseWidth = image.naturalWidth || image.width || 1;
  const baseHeight = image.naturalHeight || image.height || 1;
  const bounded = clampDimension(baseWidth, baseHeight, DEFAULT_MAX_DIMENSION);
  const targetMimeType = getTargetMimeType(sourceMimeType);
  let best = args.dataURL;
  let bestWidth = baseWidth;
  let bestHeight = baseHeight;

  for (const scale of [1, 0.82, 0.66, 0.5, 0.36]) {
    const width = Math.max(1, Math.round(bounded.width * scale));
    const height = Math.max(1, Math.round(bounded.height * scale));
    const canvas = drawToCanvas(image, width, height);
    for (const quality of [0.82, 0.7, 0.58, 0.46]) {
      const candidate = canvas.toDataURL(targetMimeType, quality);
      if (candidate.length < best.length) {
        best = candidate;
        bestWidth = width;
        bestHeight = height;
      }
      if ((dataUrlByteLength(candidate) ?? Number.POSITIVE_INFINITY) <= args.maxBytes) {
        const actualMimeType = getMimeTypeFromDataUrl(candidate) || targetMimeType;
        return {
          dataURL: candidate,
          mimeType: actualMimeType,
          width,
          height,
          changed: candidate !== args.dataURL,
        };
      }
    }
  }

  if (best === args.dataURL) return unchanged();
  return {
    dataURL: best,
    mimeType: getMimeTypeFromDataUrl(best) || targetMimeType,
    width: bestWidth,
    height: bestHeight,
    changed: true,
  };
};

// Remember dataURLs we have already processed so the per-second save poll does
// not re-encode the same (unchanged or already-compressed) image on every tick.
// Keys are the dataURL strings themselves, which are already referenced by the
// live file records, so this only stores extra pointers, not extra image bytes.
const MAX_COMPRESSION_MEMO_ENTRIES = 512;
const processedDataUrls = new Set<string>();

const rememberProcessedDataUrl = (dataURL: string): void => {
  if (processedDataUrls.size >= MAX_COMPRESSION_MEMO_ENTRIES) {
    processedDataUrls.clear();
  }
  processedDataUrls.add(dataURL);
};

// Exposed for tests; also useful to drop stale entries between drawings.
export const resetImageCompressionMemo = (): void => {
  processedDataUrls.clear();
};

export const compressExcalidrawFiles = async (
  files: Record<string, ExcalidrawFileRecord>
): Promise<{
  files: Record<string, ExcalidrawFileRecord>;
  changed: boolean;
  changedIds: string[];
}> => {
  const entries = Object.entries(files || {});
  if (entries.length === 0) {
    return { files, changed: false, changedIds: [] };
  }

  let changed = false;
  const changedIds: string[] = [];
  const next: Record<string, ExcalidrawFileRecord> = { ...files };

  for (const [id, fileRecord] of entries) {
    const dataURL = fileRecord?.dataURL;
    const mimeType =
      (typeof fileRecord?.mimeType === "string" ? fileRecord.mimeType : getMimeTypeFromDataUrl(String(dataURL || ""))) ||
      "";

    if (!isDataImageUrl(dataURL) || !canCompressMimeType(mimeType.toLowerCase())) {
      continue;
    }

    // Skip images we have already attempted (failed, not worth compressing, or
    // whose compressed output we produced) to stop the futile per-second loop.
    if (processedDataUrls.has(dataURL)) continue;

    try {
      const compressed = await maybeCompressDataUrl(dataURL, mimeType);
      rememberProcessedDataUrl(dataURL);
      if (!compressed.changed) continue;

      // The output is our best effort; memoize it so it is not re-encoded once
      // it flows back through the poll after addFiles().
      rememberProcessedDataUrl(compressed.dataURL);
      changed = true;
      changedIds.push(id);
      next[id] = {
        ...fileRecord,
        dataURL: compressed.dataURL,
        mimeType: compressed.mimeType,
      };
    } catch {
      // Keep original image data on compression failure, but remember it so a
      // decode/encode error is not retried on every subsequent save tick.
      rememberProcessedDataUrl(dataURL);
    }
  }

  return {
    files: changed ? next : files,
    changed,
    changedIds,
  };
};
