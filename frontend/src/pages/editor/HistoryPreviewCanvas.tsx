import type { BinaryFiles } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { DrawingSnapshotFull } from "../../api";
import { getHistoryPreviewAppState } from "./historyPreview";
import { validateEmbeddableUrl } from "./shared";
import { useLocale } from "../../context/useLocale";

export const HistoryPreviewCanvas = ({
  snapshot,
  theme,
  langCode,
}: {
  snapshot: DrawingSnapshotFull;
  theme: string;
  langCode: string;
}) => {
  const { t } = useLocale();
  return (
    <div
      className="absolute inset-0 z-20"
      aria-label={t("editor.history.preview")}
    >
      {/* This canvas has no live API, onChange, upload, or socket callbacks.
        Keep the live canvas mounted underneath so pending saves and incoming
        collaboration updates always use the current scene, even on cancel. */}
      <Excalidraw
        key={snapshot.id}
        initialData={{
          elements: Array.isArray(snapshot.elements)
            ? (snapshot.elements as ExcalidrawElement[])
            : [],
          appState: getHistoryPreviewAppState(snapshot.appState),
          files: (snapshot.files || {}) as BinaryFiles,
          scrollToContent: true,
        }}
        theme={theme === "dark" ? "dark" : "light"}
        langCode={langCode}
        viewModeEnabled
        zenModeEnabled
        validateEmbeddable={validateEmbeddableUrl}
      />
    </div>
  );
};
