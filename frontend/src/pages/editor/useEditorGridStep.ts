import { useEffect } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { clampGridStep } from "../../components/GridStepSelector";

interface UseEditorGridStepArgs {
  excalidrawAPI: React.RefObject<any>;
  isReady: boolean;
  gridStep: number;
}

/**
 * Applies the user's preferred grid step to the live scene. The embedded
 * Excalidraw editor keeps `gridStep` in appState but has no UI for it, so we
 * push the preference in once the API is ready and again whenever it changes.
 * `NEVER` keeps the tweak out of the undo stack; the value still rides along
 * into the next persisted appState snapshot.
 */
export const useEditorGridStep = ({
  excalidrawAPI,
  isReady,
  gridStep,
}: UseEditorGridStepArgs): void => {
  useEffect(() => {
    const api = excalidrawAPI.current;
    if (!isReady || !api || typeof api.updateScene !== "function") return;
    const next = clampGridStep(gridStep);
    if (api.getAppState?.().gridStep === next) return;
    api.updateScene({
      appState: { gridStep: next },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, [excalidrawAPI, isReady, gridStep]);
};
