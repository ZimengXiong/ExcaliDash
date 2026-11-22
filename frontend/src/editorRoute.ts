type EditorModule = { default: typeof import("./pages/Editor").Editor };

let editorModule: Promise<EditorModule> | undefined;

export const preloadEditor = () =>
  (editorModule ??= import("./pages/Editor")
    .then(({ Editor }) => ({ default: Editor }))
    .catch((error) => {
      editorModule = undefined;
      throw error;
    }));

// Forget a failed (or stale) chunk load so the next attempt imports again.
export const resetEditorModule = () => {
  editorModule = undefined;
};
