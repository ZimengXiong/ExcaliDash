export const getHistoryPreviewAppState = (
  appState: Record<string, any> | null | undefined,
): Record<string, any> => {
  // `collaborators` is runtime-owned by Excalidraw and must remain a Map.
  // Passing an explicit `undefined` through updateScene() replaces that Map,
  // causing LayerUI to crash when it reads `collaborators.size`.
  const { collaborators: _collaborators, ...previewAppState } = appState ?? {};
  return previewAppState;
};
