import { exportToBlob } from "@excalidraw/excalidraw";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1600;

export type AgentCanvasCapture = {
  state: "captured" | "blank" | "unavailable";
  imageDataUrl?: string;
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Canvas image encoding failed"));
    reader.onerror = () => reject(reader.error ?? new Error("Canvas image encoding failed"));
    reader.readAsDataURL(blob);
  });

/** Render transient visual context and distinguish a valid blank from failure. */
export const captureAgentCanvas = async (
  excalidrawApi: any,
): Promise<AgentCanvasCapture> => {
  if (!excalidrawApi) return { state: "unavailable" };
  const elements = (excalidrawApi.getSceneElements?.() ?? []).filter(
    (element: any) => element && !element.isDeleted,
  );
  if (elements.length === 0) return { state: "blank" };

  const appState = excalidrawApi.getAppState?.() ?? {};
  const blob = await exportToBlob({
    elements,
    appState: {
      ...appState,
      exportBackground: true,
      exportWithDarkMode: false,
      viewBackgroundColor: appState.viewBackgroundColor || "#ffffff",
    },
    files: excalidrawApi.getFiles?.() ?? {},
    exportPadding: 32,
    maxWidthOrHeight: MAX_IMAGE_DIMENSION,
    mimeType: "image/png",
  });
  if (blob.size > MAX_IMAGE_BYTES) return { state: "unavailable" };
  return { state: "captured", imageDataUrl: await blobToDataUrl(blob) };
};
