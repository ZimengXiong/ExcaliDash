import {
  readImageCompressionEnabled,
  readImageCompressionThresholdMb,
} from "./imageCompressionSettings";
import { blobToDataUrl } from "./dataUrls";

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

const loadImageFromDataUrl = async (
  dataURL: string,
): Promise<HTMLImageElement> => {
  const image = new Image();
  if (typeof image.decode === "function") {
    image.src = dataURL;
    await image.decode();
    return image;
  }
  return new Promise((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to decode image data"));
    image.src = dataURL;
  });
};

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
  const length = dataURL.length - separator - 1;
  if (!dataURL.startsWith(";base64,", separator - 7)) return length;
  const padding = dataURL.endsWith("==") ? 2 : dataURL.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((length * 3) / 4) - padding);
};

const encodeImage = (
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));

const maybeCompressDataUrl = async (
  inputDataURL: string,
  sourceMimeType: string,
  minBytes: number,
): Promise<CompressionResult> => {
  const effectiveMimeType = (
    sourceMimeType ||
    getMimeTypeFromDataUrl(inputDataURL) ||
    ""
  ).toLowerCase();
  if (
    !isDataImageUrl(inputDataURL) ||
    !canCompressMimeType(effectiveMimeType) ||
    estimateDataUrlBytes(inputDataURL) < minBytes
  ) {
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

  const maxDataUrlLength = Math.floor(
    inputDataURL.length * DEFAULT_MIN_IMPROVEMENT_RATIO,
  );
  try {
    for (const quality of [0.82, 0.74, 0.66, 0.58]) {
      const blob = await encodeImage(canvas, targetMimeType, quality);
      if (!blob?.size || !canCompressMimeType(blob.type)) break;
      const dataUrlLength =
        `data:${blob.type};base64,`.length + Math.ceil(blob.size / 3) * 4;
      if (dataUrlLength <= maxDataUrlLength) {
        return {
          dataURL: await blobToDataUrl(blob),
          mimeType: blob.type,
          width,
          height,
          changed: true,
        };
      }
      // Unsupported encoders fall back to PNG, which ignores quality.
      if (blob.type !== targetMimeType) break;
    }
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }

  return {
    dataURL: inputDataURL,
    mimeType: effectiveMimeType,
    width: baseWidth,
    height: baseHeight,
    changed: false,
  };
};

export const compressDroppedImagePayload = async ({
  dataURL,
  mimeType,
}: {
  dataURL: string;
  mimeType: string;
}): Promise<CompressionResult> =>
  readImageCompressionEnabled()
    ? maybeCompressDataUrl(
        dataURL,
        mimeType,
        readImageCompressionThresholdMb() * 1024 * 1024,
      )
    : { dataURL, mimeType, width: 0, height: 0, changed: false };

// Autosave and per-file uploads read the same live file records. Share the
// in-flight result and retain it while the editor holds the original record.
let compressionMemo = new WeakMap<
  ExcalidrawFileRecord,
  {
    dataURL: string;
    mimeType: string;
    result: Promise<CompressionResult | null>;
  }
>();
let memoSettings = "";

export const resetImageCompressionMemo = (): void => {
  compressionMemo = new WeakMap();
};

export const compressExcalidrawFiles = async (
  files: Record<string, ExcalidrawFileRecord>,
): Promise<{
  files: Record<string, ExcalidrawFileRecord>;
  changed: boolean;
  changedIds: string[];
}> => {
  const enabled = readImageCompressionEnabled();
  const thresholdMb = readImageCompressionThresholdMb();
  const settings = `${enabled}:${thresholdMb}`;
  if (settings !== memoSettings) {
    resetImageCompressionMemo();
    memoSettings = settings;
  }
  if (!files || !enabled) {
    return { files, changed: false, changedIds: [] };
  }

  const memo = compressionMemo;
  const changedIds: string[] = [];
  let next = files;

  for (const [id, fileRecord] of Object.entries(files)) {
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

    let entry = memo.get(fileRecord);
    if (!entry || entry.dataURL !== dataURL || entry.mimeType !== mimeType) {
      const result = maybeCompressDataUrl(
        dataURL,
        mimeType,
        thresholdMb * 1024 * 1024,
      ).catch(() => null);
      entry = { dataURL, mimeType, result };
      memo.set(fileRecord, entry);
    }
    const compressed = await entry.result;
    if (!compressed?.changed || fileRecord.dataURL !== dataURL) continue;
    if (next === files) next = { ...files };
    changedIds.push(id);
    const compressedFile = {
      ...fileRecord,
      dataURL: compressed.dataURL,
      mimeType: compressed.mimeType,
    };
    next[id] = compressedFile;
    memo.set(compressedFile, {
      dataURL: compressed.dataURL,
      mimeType: compressed.mimeType,
      result: Promise.resolve(null),
    });
  }

  return {
    files: next,
    changed: changedIds.length > 0,
    changedIds,
  };
};
