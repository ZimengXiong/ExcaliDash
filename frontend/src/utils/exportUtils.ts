import type { Drawing } from "../types";

export interface ExportData {
  type: "excalidraw";
  version: 2;
  source: string;
  elements: any[];
  appState: any;
  files: Record<string, any>;
}

/**
 * Export a drawing to a .excalidraw file and trigger download
 */
export const exportDrawingToFile = (
  drawing: Drawing,
  filename?: string
): void => {
  const exportData: ExportData = {
    type: "excalidraw",
    version: 2,
    source: window.location.origin,
    elements: drawing.elements || [],
    appState: {
      gridSize: drawing.appState?.gridSize ?? null,
      ...(drawing.appState?.gridStep != null && { gridStep: drawing.appState.gridStep }),
      ...(drawing.appState?.gridModeEnabled != null && { gridModeEnabled: drawing.appState.gridModeEnabled }),
      viewBackgroundColor: drawing.appState?.viewBackgroundColor ?? "#ffffff",
    },
    files: drawing.files || {},
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || `${drawing.name}.excalidraw`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Export drawing from Editor with current state
 */
export const exportFromEditor = (
  name: string,
  elements: readonly any[],
  appState: any,
  files: Record<string, any>
): void => {
  const exportData: ExportData = {
    type: "excalidraw",
    version: 2,
    source: window.location.origin,
    elements: Array.from(elements),
    appState: {
      gridSize: appState?.gridSize ?? null,
      ...(appState?.gridStep != null && { gridStep: appState.gridStep }),
      ...(appState?.gridModeEnabled != null && { gridModeEnabled: appState.gridModeEnabled }),
      viewBackgroundColor: appState?.viewBackgroundColor ?? "#ffffff",
    },
    files: files || {},
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}.excalidraw`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
