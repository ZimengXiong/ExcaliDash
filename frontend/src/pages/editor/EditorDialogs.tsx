import React from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { ShareModal } from "../../components/ShareModal";
import { HistoryPanel } from "../../components/HistoryPanel";

type PreviewBackup = {
  elements: readonly any[];
  appState: any;
  files: any;
};

type EditorDialogsProps = {
  drawingId?: string;
  drawingName: string;
  excalidrawAPIRef: React.MutableRefObject<any>;
  isHistoryOpen: boolean;
  isShareOpen: boolean;
  previewBackupRef: React.MutableRefObject<PreviewBackup | null>;
  onCloseHistory: () => void;
  onCloseShare: () => void;
};

export const EditorDialogs: React.FC<EditorDialogsProps> = ({
  drawingId,
  drawingName,
  excalidrawAPIRef,
  isHistoryOpen,
  isShareOpen,
  previewBackupRef,
  onCloseHistory,
  onCloseShare,
}) => {
  if (!drawingId) return null;

  return (
    <>
      <ShareModal
        drawingId={drawingId}
        drawingName={drawingName}
        isOpen={isShareOpen}
        onClose={onCloseShare}
      />
      <HistoryPanel
        drawingId={drawingId}
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
              appState: { collaborators: new Map() },
              captureUpdate: CaptureUpdateAction.NEVER,
            });
            excalidrawAPI.scrollToContent(elements, { animate: false, fitToViewport: true });
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
