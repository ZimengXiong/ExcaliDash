import {
  readImageCompressionEnabled,
  readImageCompressionThresholdMb,
} from "./imageCompressionSettings";

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

const DEFAULT_MAX_DIMENSION = 2800;
const DEFAULT_MIN_IMPROVEMENT_RATIO = 0.9;

const COMPRESSIBLE_MIME_PREFIX = "image/";
const NON_COMPRESSIBLE_MIME_TYPES = new Set(["image/svg+xml", "image/gif"]);

const isDataImageUrl = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("data:image/");

const getMimeTypeFromDataUrl = (dataURL: string): string | null => {
  const match = /^data:([^;,]+)[;,]/i.exec(dataURL);
  return match ? match[1].toLowerCase() : null;
};

const canCompressMimeType = (mimeType: string): boolean =>
  mimeType.startsWith(COMPRESSIBLE_MIME_PREFIX) &&
  !NON_COMPRESSIBLE_MIME_TYPES.has(mimeType);

const loadImageFromDataUrl = (dataURL: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to decode image data"));
    image.src = dataURL;
  });

const clampDimension = (
  width: number,
  height: number,
  maxDimension: number,
) => {
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
  height: number,
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

const estimateDataUrlBytes = (dataURL: string): number => {
  const separator = dataURL.indexOf(",");
  if (separator < 0) return dataURL.length;
  const payload = dataURL.slice(separator + 1).replace(/\s/g, "");
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
};

const maybeCompressDataUrl = async (
  inputDataURL: string,
  sourceMimeType: string,
): Promise<CompressionResult> => {
  if (!readImageCompressionEnabled()) {
    return {
      dataURL: inputDataURL,
      mimeType: sourceMimeType,
      width: 0,
      height: 0,
      changed: false,
    };
  }

  const minBytes = readImageCompressionThresholdMb() * 1024 * 1024;

  if (!isDataImageUrl(inputDataURL)) {
    return {
      dataURL: inputDataURL,
      mimeType: sourceMimeType,
      width: 0,
      height: 0,
      changed: false,
    };
  }

  const effectiveMimeType = (
    sourceMimeType ||
    getMimeTypeFromDataUrl(inputDataURL) ||
    ""
  ).toLowerCase();
  if (!canCompressMimeType(effectiveMimeType)) {
    return {
      dataURL: inputDataURL,
      mimeType: effectiveMimeType || sourceMimeType,
      width: 0,
      height: 0,
      changed: false,
    };
  }

  if (estimateDataUrlBytes(inputDataURL) < minBytes) {
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
  const { width, height } = clampDimension(
    baseWidth,
    baseHeight,
    DEFAULT_MAX_DIMENSION,
  );
  const canvas = drawToCanvas(image, width, height);
  const targetMimeType = getTargetMimeType(effectiveMimeType);

  const qualityCandidates = [0.82, 0.74, 0.66, 0.58];
  let best = inputDataURL;

  for (const quality of qualityCandidates) {
    const next = canvas.toDataURL(targetMimeType, quality);
    // Browsers return "data:," when a canvas cannot be encoded (for example
    // after exceeding implementation limits). Never replace an image with it.
    if (isDataImageUrl(next) && next.length < best.length) {
      best = next;
    }
  }

  const improvedEnough =
    best.length <=
    Math.floor(inputDataURL.length * DEFAULT_MIN_IMPROVEMENT_RATIO);
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

let memoSettings = "";

// Exposed for tests; also useful to drop stale entries between drawings.
export const resetImageCompressionMemo = (): void => {
  processedDataUrls.clear();
};

export const compressExcalidrawFiles = async (
  files: Record<string, ExcalidrawFileRecord>,
): Promise<{
  files: Record<string, ExcalidrawFileRecord>;
  changed: boolean;
  changedIds: string[];
}> => {
  const entries = Object.entries(files || {});
  const settings = `${readImageCompressionEnabled()}:${readImageCompressionThresholdMb()}`;
  if (settings !== memoSettings) {
    resetImageCompressionMemo();
    memoSettings = settings;
  }
  if (entries.length === 0 || !readImageCompressionEnabled()) {
    return { files, changed: false, changedIds: [] };
  }

  let changed = false;
  const changedIds: string[] = [];
  const next: Record<string, ExcalidrawFileRecord> = { ...files };

  for (const [id, fileRecord] of entries) {
    const dataURL = fileRecord?.dataURL;
    const mimeType =
      (typeof fileRecord?.mimeType === "string"
        ? fileRecord.mimeType
        : getMimeTypeFromDataUrl(String(dataURL || ""))) || "";

    if (
      !isDataImageUrl(dataURL) ||
      !canCompressMimeType(mimeType.toLowerCase())
    ) {
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
