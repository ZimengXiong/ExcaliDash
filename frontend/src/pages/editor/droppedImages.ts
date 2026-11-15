import { compressDroppedImagePayload } from "../../utils/imageCompression";

export const MULTI_IMAGE_DROP_GAP = 25;

export type DroppedImageData = {
  fileId: string;
  mimeType: string;
  dataURL: string;
  created: number;
  width: number;
  height: number;
};

export const createDroppedId = (): string =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `dropped-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export type DropViewport = { height: number; zoom: number };

/**
 * Size an image the way Excalidraw sizes one dropped on its own.
 * The on-screen height stays within half the viewport, a small image keeps its
 * natural size, and the aspect ratio holds.
 * This copies `initializeImageDimensions` from @excalidraw/excalidraw 0.18.
 */
export const fitDroppedImageToViewport = (
  size: { width: number; height: number },
  viewport: DropViewport,
): { width: number; height: number } => {
  const minHeight = Math.max(viewport.height - 120, 160);
  const maxHeight = Math.min(
    minHeight,
    Math.floor(viewport.height * 0.5) / viewport.zoom,
  );
  const height = Math.min(size.height, maxHeight);
  return { width: height * (size.width / size.height), height };
};

export const isSupportedDroppedImageFile = (file: File): boolean => {
  if (typeof file?.type === "string" && file.type.startsWith("image/")) {
    return true;
  }
  return /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file?.name || "");
};

export const getDroppedImageFiles = (
  dataTransfer?: DataTransfer | null,
): File[] =>
  Array.from(dataTransfer?.files || []).filter(isSupportedDroppedImageFile);

const readFileAsDataURL = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error || new Error("Failed to read image file"));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Failed to read image file"));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(file);
  });

const getImageDimensions = (
  file: File,
): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        width: Math.max(1, Math.round(image.naturalWidth || image.width || 1)),
        height: Math.max(
          1,
          Math.round(image.naturalHeight || image.height || 1),
        ),
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to decode dropped image"));
    };
    image.src = objectUrl;
  });

export const loadDroppedImageData = async (
  file: File,
): Promise<DroppedImageData> => {
  const [rawDataURL, dimensions] = await Promise.all([
    readFileAsDataURL(file),
    getImageDimensions(file),
  ]);
  let dataURL = rawDataURL;
  let mimeType = file.type || "application/octet-stream";
  let width = dimensions.width;
  let height = dimensions.height;
  try {
    const compressed = await compressDroppedImagePayload({
      dataURL: rawDataURL,
      mimeType,
    });
    if (compressed.changed) {
      dataURL = compressed.dataURL;
      mimeType = compressed.mimeType;
      width = compressed.width || width;
      height = compressed.height || height;
    }
  } catch {
    // Keep the original dropped image if compression is unavailable.
  }
  return {
    fileId: createDroppedId(),
    mimeType,
    dataURL,
    created: Date.now(),
    width,
    height,
  };
};
