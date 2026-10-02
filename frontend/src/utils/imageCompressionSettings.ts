export const IMAGE_COMPRESSION_ENABLED_KEY = "excalidash-image-compression";
export const IMAGE_COMPRESSION_THRESHOLD_MB_KEY =
  "excalidash-image-compression-threshold-mb";

export const DEFAULT_IMAGE_COMPRESSION_THRESHOLD_MB = 0.25;
export const MIN_IMAGE_COMPRESSION_THRESHOLD_MB = 0.1;
export const MAX_IMAGE_COMPRESSION_THRESHOLD_MB = 100;

export const readImageCompressionEnabled = (): boolean => {
  try {
    return (
      window.localStorage?.getItem?.(IMAGE_COMPRESSION_ENABLED_KEY) !== "false"
    );
  } catch {
    return true;
  }
};

export const normalizeImageCompressionThreshold = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_IMAGE_COMPRESSION_THRESHOLD_MB;
  return Math.min(
    MAX_IMAGE_COMPRESSION_THRESHOLD_MB,
    Math.max(MIN_IMAGE_COMPRESSION_THRESHOLD_MB, value),
  );
};

export const readImageCompressionThresholdMb = (): number => {
  if (typeof window === "undefined") {
    return DEFAULT_IMAGE_COMPRESSION_THRESHOLD_MB;
  }
  try {
    const raw = window.localStorage?.getItem?.(
      IMAGE_COMPRESSION_THRESHOLD_MB_KEY,
    );
    if (!raw?.trim()) return DEFAULT_IMAGE_COMPRESSION_THRESHOLD_MB;
    return normalizeImageCompressionThreshold(Number(raw));
  } catch {
    return DEFAULT_IMAGE_COMPRESSION_THRESHOLD_MB;
  }
};

export const writeImageCompressionThresholdMb = (value: number): number => {
  const normalized = normalizeImageCompressionThreshold(value);
  try {
    window.localStorage?.setItem?.(
      IMAGE_COMPRESSION_THRESHOLD_MB_KEY,
      String(normalized),
    );
  } catch {
    // Keep the in-memory setting when storage is unavailable.
  }
  return normalized;
};
