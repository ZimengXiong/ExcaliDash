import React from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { HistoryPanel } from "../../components/HistoryPanel";
import { getHistoryPreviewAppState } from "./historyPreview";

type PreviewBackup = {
  elements: readonly any[];
  appState: any;
  files: any;
};

type EditorDialogsProps = {
  drawingId?: string;
  historyButtonRef: React.RefObject<HTMLButtonElement>;
  getCurrentVersion: () => number | null;
  excalidrawAPIRef: React.MutableRefObject<any>;
  isHistoryOpen: boolean;
  previewBackupRef: React.MutableRefObject<PreviewBackup | null>;
  onCloseHistory: () => void;
};

export const EditorDialogs: React.FC<EditorDialogsProps> = ({
  drawingId,
  historyButtonRef,
  getCurrentVersion,
  excalidrawAPIRef,
  isHistoryOpen,
  previewBackupRef,
  onCloseHistory,
}) => {
  if (!drawingId) return null;

  return (
    <>
      <HistoryPanel
        drawingId={drawingId}
        anchorRef={historyButtonRef}
        getCurrentVersion={getCurrentVersion}
        isOpen={isHistoryOpen}
        onClose={onCloseHistory}
        onPreview={(snapshot) => {
          const excalidrawAPI = excalidrawAPIRef.current;
          if (!excalidrawAPI) return;
          if (snapshot) {
            if (!previewBackupRef.current) {
              previewBackupRef.current = {
                elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
                appState: excalidrawAPI.getAppState(),
                files: excalidrawAPI.getFiles(),
              };
            }
            const elements = Array.isArray(snapshot.elements)
              ? snapshot.elements
              : [];
            const files = snapshot.files || {};
            if (Object.keys(files).length > 0) {
              excalidrawAPI.addFiles(Object.values(files));
            }
            excalidrawAPI.updateScene({
              elements,
              appState: getHistoryPreviewAppState(snapshot.appState),
              captureUpdate: CaptureUpdateAction.NEVER,
            });
            excalidrawAPI.scrollToContent(elements, {
              animate: false,
              fitToViewport: true,
            });
            excalidrawAPI.setActiveTool({ type: "hand" });
            return;
          }
          if (previewBackupRef.current) {
            excalidrawAPI.updateScene({
              elements: previewBackupRef.current.elements as any[],
              appState: previewBackupRef.current.appState,
              captureUpdate: CaptureUpdateAction.NEVER,
            });
            if (previewBackupRef.current.files) {
              excalidrawAPI.addFiles(
                Object.values(previewBackupRef.current.files),
              );
            }
            previewBackupRef.current = null;
          }
        }}
        onRestore={() => {
          previewBackupRef.current = null;
          window.location.reload();
        }}
      />
    </>
  );
};
