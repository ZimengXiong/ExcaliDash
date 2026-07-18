import { useRef } from "react";

export const useEditorRuntimeRefs = () => ({
  isBootstrappingScene: useRef(true),
  hasHydratedInitialScene: useRef(false),
  latestElementsRef: useRef<readonly any[]>([]),
  initialSceneElementsRef: useRef<readonly any[]>([]),
  latestFilesRef: useRef<any>(null),
  lastSyncedFilesRef: useRef<Record<string, any>>({}),
  lastSyncedElementOrderSigRef: useRef(""),
  lastPersistedFilesRef: useRef<Record<string, any>>({}),
  uploadedFileRefsRef: useRef<Record<string, string>>({}),
  onFileUploadCompleteRef: useRef<(() => void) | null>(null),
  latestAppStateRef: useRef<any>(null),
  debouncedSaveRef: useRef<
    | ((
        drawingId: string,
        elements: readonly any[],
        appState: any,
        files?: Record<string, any>,
      ) => void)
    | null
  >(null),
  currentDrawingVersionRef: useRef<number | null>(null),
  lastPersistedElementsRef: useRef<readonly any[]>([]),
  saveQueueRef: useRef<Promise<void>>(Promise.resolve()),
  suspiciousBlankLoadRef: useRef(false),
  libraryItemsRef: useRef<readonly any[]>([]),
  libraryVersionRef: useRef(0),
  libraryHydratedRef: useRef(false),
  hasSceneChangesSinceLoadRef: useRef(false),
  lastLocalChangeAtRef: useRef(0),
  editorContainerRef: useRef<HTMLDivElement>(null),
  excalidrawAPI: useRef<any>(null),
  selfAgentBatchIdsRef: useRef<Set<string>>(new Set()),
});
