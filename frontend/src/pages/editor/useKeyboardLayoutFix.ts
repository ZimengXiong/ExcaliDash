import { useEffect } from "react";

import { attachKeyboardLayoutFix } from "./keyboardLayoutFix";

/**
 * Keeps Excalidraw's single-key shortcuts working under non-Latin keyboard
 * layouts. Attached to the document rather than the editor container so that
 * this app's own window-level shortcuts (ctrl/cmd+s) are covered too.
 */
export const useKeyboardLayoutFix = (): void => {
  useEffect(() => attachKeyboardLayoutFix(document), []);
};
