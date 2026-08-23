import { api } from "../api";
import { type UploadStatus } from "../context/UploadContext";
import {
  coerceTimestamp,
  createCollectionResolver,
  extractDrawingData,
  importLegacyZip,
  isLegacyExportJson,
  makeSvgPreview,
  type LegacyExportDrawing,
} from "./importHelpers";

export const EXCALIDASH_REQUIRED_MESSAGE = "A .excalidash file is required.";

export const isExcalidashFile = (file: Pick<File, "name">): boolean =>
  file.name.toLowerCase().endsWith(".excalidash");

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

  const originalIndexMap = new Map<number, number>();
  drawingFiles.forEach((df, i) => {
    const originalIndex = files.indexOf(df);
    originalIndexMap.set(i, originalIndex);
  });

  await Promise.all(
    drawingFiles.map(async (file, drawingIndex) => {
      const fileIndex = originalIndexMap.get(drawingIndex) ?? drawingIndex;
      try {
        if (onProgress) onProgress(fileIndex, 'processing', 0);

        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;
        const extracted = extractDrawingData(parsed);
        if (!extracted) throw new Error(`Invalid file structure: ${file.name}`);

        const svg = await makeSvgPreview(extracted.elements, extracted.appState, extracted.files);

        const payload = {
          name: file.name.replace(/\.(json|excalidraw)$/, ""),
          elements: extracted.elements,
          appState: extracted.appState,
          files: extracted.files || null,
          collectionId: targetCollectionId,
          createdAt: (parsed as any)?.createdAt || Date.now(),
          updatedAt: (parsed as any)?.updatedAt || Date.now(),
          preview: svg.outerHTML,
        };

        if (onProgress) onProgress(fileIndex, 'uploading', 0);

        await api.post("/drawings", payload, {
          headers: {
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

/**
 * Legacy import helper.
 * - Supports individual `.excalidraw` / Excalidraw `.json` drawings (same as importDrawings)
 * - Supports legacy ExcaliDash export `.json` with `{ drawings: [...] }`
 */
export const importLegacyFiles = async (
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
    (f) =>
      f.name.endsWith(".json") ||
      f.name.endsWith(".excalidraw") ||
      f.name.endsWith(".zip")
  );

  if (drawingFiles.length === 0) {
    return { success: 0, failed: 0, errors: ["No supported files found."] };
  }

  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];

  const originalIndexMap = new Map<number, number>();
  drawingFiles.forEach((df, i) => {
    const originalIndex = files.indexOf(df);
    originalIndexMap.set(i, originalIndex);
  });

  const collectionResolver = createCollectionResolver();

  await Promise.all(
    drawingFiles.map(async (file, drawingIndex) => {
      const fileIndex = originalIndexMap.get(drawingIndex) ?? drawingIndex;
      try {
        if (onProgress) onProgress(fileIndex, "processing", 0);

        if (file.name.endsWith(".zip")) {
          const result = await importLegacyZip(file, targetCollectionId);
          successCount += result.success;
          failCount += result.failed;
          errors.push(...result.errors);
          if (onProgress) onProgress(fileIndex, result.failed > 0 ? "error" : "success", 100, result.failed > 0 ? result.errors.join("\n") : undefined);
          return;
        }

        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;

        if (isLegacyExportJson(parsed)) {
          const exportJson = parsed;
          const drawings = Array.isArray(exportJson.drawings)
            ? exportJson.drawings
            : [];

          if (drawings.length === 0) {
            throw new Error("Legacy export JSON contains no drawings.");
          }

          for (let i = 0; i < drawings.length; i += 1) {
            const d = drawings[i] as LegacyExportDrawing;
            const extracted = extractDrawingData(d);
            if (!extracted) {
              failCount += 1;
              errors.push(
                `${file.name}: drawing ${i + 1}: Invalid structure (missing elements/appState)`
              );
              continue;
            }

            let collectionId: string | null = null;
            if (targetCollectionId !== null) {
              collectionId = targetCollectionId;
            } else if (d.collectionId === "trash" || d.collectionName === "Trash") {
              collectionId = "trash";
            } else if (typeof d.collectionName === "string" && d.collectionName.trim()) {
              collectionId = await collectionResolver.getOrCreateCollectionIdByName(d.collectionName.trim());
            } else {
              collectionId = null;
            }

            const svg = await makeSvgPreview(extracted.elements, extracted.appState, extracted.files);

            const payload = {
              name:
                typeof d.name === "string" && d.name.trim().length > 0
                  ? d.name
                  : `Imported Drawing ${i + 1}`,
              elements: extracted.elements,
              appState: extracted.appState,
              files: extracted.files || null,
              collectionId,
              createdAt: coerceTimestamp(d.createdAt),
              updatedAt: coerceTimestamp(d.updatedAt),
              preview: svg.outerHTML,
            };

            await api.post("/drawings", payload, {
              headers: {
                "X-Imported-File": "true",
              },
            });

            successCount += 1;
          }

          if (onProgress) onProgress(fileIndex, "success", 100);
          return;
        }

        if (
          typeof parsed === "object" &&
          parsed !== null &&
          extractDrawingData(parsed)
        ) {
          const mappedOnProgress = onProgress
            ? (_idx: number, status: UploadStatus, progress: number, error?: string) =>
                onProgress(fileIndex, status, progress, error)
            : undefined;
          const result = await importDrawings(
            [file],
            targetCollectionId,
            undefined,
            mappedOnProgress
          );
          successCount += result.success;
          failCount += result.failed;
          errors.push(...result.errors);
          return;
        }

        throw new Error(`Invalid file structure: ${file.name}`);
      } catch (err: any) {
        console.error(`Failed to import ${file.name}:`, err);
        failCount += 1;
        const errorMessage =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          "Upload failed";
        errors.push(`${file.name}: ${errorMessage}`);
        if (onProgress) onProgress(fileIndex, "error", 0, errorMessage);
      }
    })
  );

  if (successCount > 0 && onSuccess) {
    await onSuccess();
  }

  return { success: successCount, failed: failCount, errors };
};
