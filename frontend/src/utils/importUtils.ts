import { exportToSvg } from "@excalidraw/excalidraw";
import { API_URL } from "../api";

export const importDrawings = async (
  files: File[],
  targetCollectionId: string | null,
  onSuccess?: () => void | Promise<void>
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

  await Promise.all(
    drawingFiles.map(async (file) => {
      try {
        const text = await file.text();
        const data = JSON.parse(text);

        // Basic validation
        if (!data.elements || !data.appState) {
          throw new Error(`Invalid file structure: ${file.name}`);
        }

        // Use raw elements directly from the file - no normalization needed
        // Generate Preview with raw elements
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

        // Prepare payload with raw elements
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

        const res = await fetch(`${API_URL}/drawings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Imported-File": "true", // Mark as imported file for additional validation
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error("API Error");
        successCount++;
      } catch (err: any) {
        console.error(`Failed to import ${file.name}:`, err);
        failCount++;
        errors.push(`${file.name}: ${err.message}`);
      }
    })
  );

  if (successCount > 0 && onSuccess) {
    await onSuccess();
  }

  return { success: successCount, failed: failCount, errors };
};
