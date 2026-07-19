import { api } from "../api";
import type { UploadStatus } from "../context/UploadContext";

export const EXCALIDASH_REQUIRED_MESSAGE = "A .excalidash file is required.";

export const isExcalidashFile = (file: Pick<File, "name">): boolean =>
  file.name.toLowerCase().endsWith(".excalidash");

export const importExcalidashFiles = async (
  files: File[],
  onSuccess?: () => void | Promise<void>,
  onProgress?: (
    fileIndex: number,
    status: UploadStatus,
    progress: number,
    error?: string,
  ) => void,
) => {
  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const [fileIndex, file] of files.entries()) {
    if (!isExcalidashFile(file)) {
      failed += 1;
      errors.push(`${file.name}: ${EXCALIDASH_REQUIRED_MESSAGE}`);
      onProgress?.(fileIndex, "error", 0, EXCALIDASH_REQUIRED_MESSAGE);
      continue;
    }

    try {
      onProgress?.(fileIndex, "uploading", 0);
      const formData = new FormData();
      formData.append("archive", file);
      await api.post("/import/excalidash", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (event) => {
          if (!event.total) return;
          onProgress?.(
            fileIndex,
            "uploading",
            Math.round((event.loaded * 100) / event.total),
          );
        },
      });
      success += 1;
      onProgress?.(fileIndex, "success", 100);
    } catch (error: any) {
      failed += 1;
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Import failed.";
      errors.push(`${file.name}: ${message}`);
      onProgress?.(fileIndex, "error", 0, message);
    }
  }

  if (success > 0) await onSuccess?.();
  return { success, failed, errors };
};
