import { exportToSvg } from "@excalidraw/excalidraw";
import { api } from "../api";
import { type UploadStatus } from "../context/UploadContext";

export const importDrawings = async (
  files: File[],
  targetCollectionId: string | null,
  onSuccess?: () => void | Promise<void>,
  onProgress?: (
    fileIndex: number,
    status: UploadStatus,
    progress: number,
    error?: string
  ) => void
) => {
  const drawingFiles = files.filter(
    (f) => f.name.endsWith(".json") || f.name.endsWith(".excalidraw")
  );

  if (drawingFiles.length === 0) {
    return { success: 0, failed: 0, errors: ["No supported files found."] };
  }

  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];

  // Build a map from drawingFile index to original file index for progress reporting
  const originalIndexMap = new Map<number, number>();
  drawingFiles.forEach((df, i) => {
    const originalIndex = files.indexOf(df);
    originalIndexMap.set(i, originalIndex);
  });

  // We process files in parallel (Promise.all) but we could limit concurrency if needed.
  // For now, full parallel is fine as browser limits connection count anyway.
  await Promise.all(
    drawingFiles.map(async (file, drawingIndex) => {
      const fileIndex = originalIndexMap.get(drawingIndex) ?? drawingIndex;
      try {
        if (onProgress) onProgress(fileIndex, 'processing', 0); // Parsing phase

        const text = await file.text();
        const data = JSON.parse(text);

        if (!data.elements || !data.appState) {
          throw new Error(`Invalid file structure: ${file.name}`);
        }

        const svg = await exportToSvg({
          elements: data.elements,
          appState: {
            ...data.appState,
            exportBackground: true,
            viewBackgroundColor: data.appState.viewBackgroundColor || "#ffffff",
          },
          files: data.files || {},
          exportPadding: 10,
        });

        const payload = {
          name: file.name.replace(/\.(json|excalidraw)$/, ""),
          elements: data.elements,
          appState: data.appState,
          files: data.files || null,
          collectionId: targetCollectionId,
          createdAt: data.createdAt || Date.now(),
          updatedAt: data.updatedAt || Date.now(),
          preview: svg.outerHTML,
        };

        if (onProgress) onProgress(fileIndex, 'uploading', 0);

        await api.post("/drawings", payload, {
          headers: {
            // Backend uses this header to apply stricter validation for imported files.
            "X-Imported-File": "true",
          },
          onUploadProgress: (progressEvent) => {
            if (onProgress && progressEvent.total) {
              const percentCompleted = Math.round(
                (progressEvent.loaded * 100) / progressEvent.total
              );
              onProgress(fileIndex, 'uploading', percentCompleted);
            }
          },
        });

        if (onProgress) onProgress(fileIndex, 'success', 100);
        successCount++;

      } catch (err: any) {
        console.error(`Failed to import ${file.name}:`, err);
        failCount++;
        const errorMessage =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          "Upload failed";
        errors.push(`${file.name}: ${errorMessage}`);
        if (onProgress) onProgress(fileIndex, 'error', 0, errorMessage);
      }
    })
  );

  if (successCount > 0 && onSuccess) {
    await onSuccess();
  }

  return { success: successCount, failed: failCount, errors };
};
