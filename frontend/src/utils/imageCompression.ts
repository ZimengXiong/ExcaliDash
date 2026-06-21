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
  if (!canCompressMimeType(effectiveMimeType)) {
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

  return {
    dataURL: best,
    mimeType: targetMimeType,
    width,
    height,
    changed: true,
  };
};

export const compressDroppedImagePayload = async (args: {
  dataURL: string;
  mimeType: string;
}) => maybeCompressDataUrl(args.dataURL, args.mimeType);

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

    try {
      const compressed = await maybeCompressDataUrl(dataURL, mimeType);
      if (!compressed.changed) continue;

      changed = true;
      changedIds.push(id);
      next[id] = {
        ...fileRecord,
        dataURL: compressed.dataURL,
        mimeType: compressed.mimeType,
      };
    } catch {
      // Keep original image data on compression failure.
    }
  }

  return {
    files: changed ? next : files,
    changed,
    changedIds,
  };
};
