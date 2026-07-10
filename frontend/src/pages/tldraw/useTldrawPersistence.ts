import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import debounce from "lodash/debounce";
import { loadSnapshot } from "tldraw";
import type { Editor } from "tldraw";
import * as api from "../../api";
import { saveDrawingKeepalive } from "../editor/keepaliveSave";
import {
  generateScenePreview,
  readSceneSnapshot,
} from "./tldrawSceneIo";

const SAVE_DEBOUNCE_MS = 2000;

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type TldrawConflict = { currentVersion: number } | null;

export interface TldrawPersistence {
  saveStatus: SaveStatus;
  conflict: TldrawConflict;
  hasUnsavedChanges: boolean;
  reloadFromServer: () => Promise<void>;
  overwriteServer: () => Promise<void>;
}

interface Options {
  drawingId: string;
  editor: Editor | null;
  canEdit: boolean;
  initialVersion: number;
}

const extractConflictVersion = (err: unknown, fallback: number): number => {
  if (api.isAxiosError(err)) {
    const current = (err.response?.data as { currentVersion?: unknown })
      ?.currentVersion;
    if (typeof current === "number") return current;
  }
  return fallback;
};

/**
 * Single-editor, last-write-wins persistence for a tldraw drawing. Debounced
 * document-change saves speak the existing versioned PUT protocol; a 409
 * surfaces a conflict the caller resolves by reloading or overwriting. A
 * `pagehide` keepalive flush mirrors the excalidraw editor so in-flight edits
 * survive tab close. tldraw runs its own sync; this bridges none of it.
 */
export const useTldrawPersistence = ({
  drawingId,
  editor,
  canEdit,
  initialVersion,
}: Options): TldrawPersistence => {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [conflict, setConflict] = useState<TldrawConflict>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const versionRef = useRef(initialVersion);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    versionRef.current = initialVersion;
  }, [initialVersion]);

  // Persist the current scene. `force` re-reads the authoritative version first
  // so an explicit overwrite wins over the conflicting server copy.
  const persist = useCallback(
    async (targetEditor: Editor, force: boolean): Promise<void> => {
      if (inFlightRef.current) {
        pendingRef.current = true;
        return;
      }
      inFlightRef.current = true;
      setSaveStatus("saving");
      try {
        const { document, session } = readSceneSnapshot(targetEditor);
        const preview = await generateScenePreview(targetEditor);
        const body = {
          elements: document,
          appState: session,
          version: force ? undefined : versionRef.current,
          ...(preview !== null ? { preview } : {}),
        };
        const updated = await api.updateDrawing(
          drawingId,
          body as unknown as Partial<import("../../types").Drawing>,
        );
        if (typeof updated.version === "number") {
          versionRef.current = updated.version;
        }
        setConflict(null);
        setHasUnsavedChanges(false);
        setSaveStatus("saved");
      } catch (err) {
        if (api.isAxiosError(err) && err.response?.status === 409) {
          setConflict({
            currentVersion: extractConflictVersion(err, versionRef.current),
          });
        }
        setSaveStatus("error");
        throw err;
      } finally {
        inFlightRef.current = false;
        if (pendingRef.current) {
          pendingRef.current = false;
          void persist(targetEditor, false).catch(() => undefined);
        }
      }
    },
    [drawingId],
  );

  const debouncedSave = useMemo(
    () =>
      debounce((targetEditor: Editor) => {
        void persist(targetEditor, false).catch(() => undefined);
      }, SAVE_DEBOUNCE_MS),
    [persist],
  );

  // Subscribe to user-authored document changes and debounce a save.
  useEffect(() => {
    if (!editor || !canEdit) return;
    const unlisten = editor.store.listen(
      () => {
        setHasUnsavedChanges(true);
        debouncedSave(editor);
      },
      { source: "user", scope: "document" },
    );
    return () => {
      unlisten();
      debouncedSave.cancel();
    };
  }, [editor, canEdit, debouncedSave]);

  // Best-effort flush on tab close / navigation away.
  useEffect(() => {
    if (!editor || !canEdit) return;
    const handlePageHide = () => {
      debouncedSave.cancel();
      const { document, session } = readSceneSnapshot(editor);
      saveDrawingKeepalive(drawingId, {
        elements: document,
        appState: session,
        version: versionRef.current,
      });
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [editor, canEdit, drawingId, debouncedSave]);

  const reloadFromServer = useCallback(async () => {
    if (!editor) return;
    const drawing = await api.getDrawing(drawingId);
    const document = drawing.elements as unknown;
    const session = drawing.appState as unknown;
    loadSnapshot(
      editor.store,
      session && typeof session === "object" && Object.keys(session).length > 0
        ? { document: document as never, session: session as never }
        : { document: document as never },
    );
    versionRef.current = drawing.version;
    setConflict(null);
    setHasUnsavedChanges(false);
    setSaveStatus("idle");
  }, [editor, drawingId]);

  const overwriteServer = useCallback(async () => {
    if (!editor || !conflict) return;
    // Adopt the server's current version so the forced PUT passes the guard.
    versionRef.current = conflict.currentVersion;
    await persist(editor, true).catch(() => undefined);
  }, [editor, conflict, persist]);

  return {
    saveStatus,
    conflict,
    hasUnsavedChanges,
    reloadFromServer,
    overwriteServer,
  };
};
