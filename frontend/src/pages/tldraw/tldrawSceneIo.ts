import {
  getSnapshot,
  serializeTldrawJsonBlob,
  TLDRAW_FILE_EXTENSION,
} from "tldraw";
import type {
  Editor,
  TLEditorSnapshot,
  TLSessionStateSnapshot,
  TLStoreSnapshot,
} from "tldraw";

// Pure, editor-adjacent helpers for translating between a stored Drawing row
// and tldraw's snapshot model. Kept free of React so they can be unit-tested
// without mounting the (heavy, DOM-bound) tldraw editor.

// A tldraw drawing stores its scene as the document snapshot ({store, schema})
// in the `elements` column and its session snapshot (camera/page/selection) in
// the `appState` column. Both are opaque objects on the wire.
export type TldrawScenePayload = {
  document: TLStoreSnapshot;
  session: TLSessionStateSnapshot | Record<string, never>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * True when a stored document snapshot actually carries records. A freshly
 * created tldraw row is `{store: {}, schema: {}}`; loading that empty snapshot
 * would wipe the default document/page records tldraw creates on mount, so
 * callers skip `loadSnapshot` and let tldraw initialize a blank scene instead.
 */
export const hasStoreContent = (elements: unknown): boolean => {
  if (!isRecord(elements)) return false;
  const store = elements.store;
  return isRecord(store) && Object.keys(store).length > 0;
};

/**
 * Build the value for the `<Tldraw snapshot>` prop from stored columns, or
 * `undefined` for an empty row (so tldraw initializes its own blank scene).
 * When a session snapshot is present it is included so the owner's last
 * camera/page is restored; otherwise a bare store snapshot is returned.
 */
export const buildInitialSnapshot = (
  elements: unknown,
  appState: unknown,
): TLEditorSnapshot | TLStoreSnapshot | undefined => {
  if (!hasStoreContent(elements)) return undefined;
  const document = elements as TLStoreSnapshot;
  if (isRecord(appState) && Object.keys(appState).length > 0) {
    return { document, session: appState as unknown as TLSessionStateSnapshot };
  }
  return document;
};

/** Snapshot the live editor store into the wire shape persisted to the row. */
export const readSceneSnapshot = (editor: Editor): TldrawScenePayload => {
  const { document, session } = getSnapshot(editor.store);
  return { document, session };
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * Render a static preview of the current page for the dashboard card. Primary
 * output is an SVG string (which flows through the server's sanitizeSvg on the
 * existing `preview` path). If SVG export fails — or the sanitizer would strip
 * tldraw's foreignObject text, leaving a blank card — the caller can fall back;
 * here we additionally guard by falling back to a PNG data URL on any SVG error.
 * Returns `null` for an empty page so the previous preview is left untouched.
 */
export const generateScenePreview = async (
  editor: Editor,
): Promise<string | null> => {
  const shapeIds = Array.from(editor.getCurrentPageShapeIds());
  if (shapeIds.length === 0) return null;
  try {
    const result = await editor.getSvgString(shapeIds, { background: true });
    if (result?.svg) return result.svg;
  } catch {
    // fall through to PNG
  }
  try {
    const image = await editor.toImage(shapeIds, {
      format: "png",
      background: true,
    });
    return await blobToDataUrl(image.blob);
  } catch {
    return null;
  }
};

/**
 * Trigger a client-side download of the current scene as a `.tldr` file (the
 * native tldraw file format — essentially the serialized snapshot).
 */
export const downloadTldrFile = async (
  editor: Editor,
  drawingName: string,
): Promise<void> => {
  const blob = await serializeTldrawJsonBlob(editor);
  const url = URL.createObjectURL(blob);
  try {
    const safeName =
      drawingName.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") ||
      "drawing";
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeName}${TLDRAW_FILE_EXTENSION}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Revoke on the next tick so the click has a chance to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
};
