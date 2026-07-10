import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Tldraw } from "tldraw";
import type { Editor } from "tldraw";
import { getAssetUrlsByImport } from "@tldraw/assets/imports.vite";
import "tldraw/tldraw.css";
import { useTheme } from "../../context/ThemeContext";
import * as api from "../../api";
import type { Drawing } from "../../types";
import { buildInitialSnapshot, downloadTldrFile } from "./tldrawSceneIo";
import { useTldrawPersistence } from "./useTldrawPersistence";

// Bundled (Vite `?url`) tldraw assets so fonts/icons/translations are served
// from this deployment instead of tldraw's CDN — required for air-gapped
// installs. Computed once when this lazy chunk loads.
const tldrawAssetUrls = getAssetUrlsByImport();

// Optional per-deployment license key (removes the watermark for buyers). Unset
// by default: the free tldraw 3.x license keeps the "Made with tldraw"
// watermark on canvas, which we must not hide.
const licenseKey =
  (import.meta.env.VITE_TLDRAW_LICENSE_KEY as string | undefined) || undefined;

// Client mirror of the server's tldraw scene cap: reject a single pasted/dropped
// asset larger than this so the user gets an in-editor error instead of a 413.
const MAX_TLDRAW_ASSET_BYTES = 10 * 1024 * 1024;

const statusLabel = (
  status: ReturnType<typeof useTldrawPersistence>["saveStatus"],
  unsaved: boolean,
): string => {
  if (status === "saving") return "Saving…";
  if (status === "error") return "Save failed";
  if (unsaved) return "Unsaved changes";
  if (status === "saved") return "All changes saved";
  return "";
};

interface LoadedScene {
  snapshot: ReturnType<typeof buildInitialSnapshot>;
  name: string;
  version: number;
  canEdit: boolean;
}

export const TldrawEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [scene, setScene] = useState<LoadedScene | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [drawingName, setDrawingName] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!id) return;
    setScene(null);
    setLoadError(null);
    api
      .getDrawing(id)
      .then((drawing: Drawing) => {
        if (cancelled) return;
        const canEdit =
          drawing.accessLevel === "edit" || drawing.accessLevel === "owner";
        setScene({
          snapshot: buildInitialSnapshot(drawing.elements, drawing.appState),
          name: drawing.name,
          version: drawing.version,
          canEdit,
        });
        setDrawingName(drawing.name);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError("This drawing could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const persistence = useTldrawPersistence({
    drawingId: id ?? "",
    editor,
    canEdit: scene?.canEdit ?? false,
    initialVersion: scene?.version ?? 1,
  });

  const canEdit = scene?.canEdit ?? false;

  const handleMount = useCallback(
    (mounted: Editor) => {
      setEditor(mounted);
      if (!canEdit) mounted.updateInstanceState({ isReadonly: true });
      mounted.user.updateUserPreferences({
        colorScheme: theme === "dark" ? "dark" : "light",
      });
    },
    [canEdit, theme],
  );

  useEffect(() => {
    if (editor)
      editor.user.updateUserPreferences({
        colorScheme: theme === "dark" ? "dark" : "light",
      });
  }, [editor, theme]);

  const handleDownload = useCallback(async () => {
    if (!editor) return;
    try {
      await downloadTldrFile(editor, drawingName || "drawing");
    } catch {
      toast.error("Could not export .tldr file");
    }
  }, [editor, drawingName]);

  const handleRename = useCallback(
    async (next: string) => {
      const trimmed = next.trim();
      if (!id || !trimmed || trimmed === drawingName) return;
      const previous = drawingName;
      setDrawingName(trimmed);
      try {
        await api.updateDrawing(id, { name: trimmed });
      } catch {
        setDrawingName(previous);
        toast.error("Could not rename drawing");
      }
    },
    [id, drawingName],
  );

  const components = useMemo(() => ({}), []);

  if (loadError) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white dark:bg-neutral-950 px-6">
        <p className="text-sm text-gray-600 dark:text-gray-400">{loadError}</p>
        <BackButton onClick={() => navigate("/")} />
      </div>
    );
  }

  if (!scene) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-neutral-950">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col bg-white dark:bg-neutral-950">
      <TldrawTopBar
        drawingName={drawingName}
        canEdit={canEdit}
        status={statusLabel(persistence.saveStatus, persistence.hasUnsavedChanges)}
        onBack={() => navigate("/")}
        onDownload={handleDownload}
        onRename={handleRename}
      />
      <div className="relative flex-1">
        <Tldraw
          snapshot={scene.snapshot}
          onMount={handleMount}
          assetUrls={tldrawAssetUrls}
          licenseKey={licenseKey}
          maxAssetSize={MAX_TLDRAW_ASSET_BYTES}
          components={components}
        />
      </div>
      {persistence.conflict && (
        <ConflictBanner
          onReload={() => {
            void persistence.reloadFromServer().catch(() => {
              toast.error("Could not reload the latest version");
            });
          }}
          onOverwrite={() => {
            void persistence.overwriteServer();
          }}
        />
      )}
    </div>
  );
};

const BackButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    onClick={onClick}
    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100 font-semibold hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
  >
    <ArrowLeft size={16} />
    Back
  </button>
);

interface TopBarProps {
  drawingName: string;
  canEdit: boolean;
  status: string;
  onBack: () => void;
  onDownload: () => void;
  onRename: (next: string) => void;
}

const TldrawTopBar: React.FC<TopBarProps> = ({
  drawingName,
  canEdit,
  status,
  onBack,
  onDownload,
  onRename,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(drawingName);
  useEffect(() => setDraft(drawingName), [drawingName]);

  const commit = () => {
    setIsEditing(false);
    onRename(draft);
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b-2 border-black dark:border-neutral-800 bg-white dark:bg-neutral-950">
      <BackButton onClick={onBack} />
      {canEdit && isEditing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(drawingName);
              setIsEditing(false);
            }
          }}
          className="min-w-0 flex-1 px-2 py-1 rounded border border-gray-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
        />
      ) : (
        <button
          onClick={() => canEdit && setIsEditing(true)}
          className="min-w-0 flex-1 truncate text-left font-semibold text-gray-900 dark:text-gray-100"
          title={canEdit ? "Click to rename" : drawingName}
        >
          {drawingName || "Untitled Drawing"}
        </button>
      )}
      <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
        {status}
      </span>
      <button
        onClick={onDownload}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100 font-semibold hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
      >
        <Download size={16} />
        .tldr
      </button>
    </div>
  );
};

const ConflictBanner: React.FC<{
  onReload: () => void;
  onOverwrite: () => void;
}> = ({ onReload, onOverwrite }) => (
  <div className="absolute left-1/2 top-16 z-[999] -translate-x-1/2 max-w-md rounded-lg border-2 border-amber-500 bg-amber-50 dark:bg-amber-950 px-4 py-3 shadow-lg">
    <p className="text-sm text-amber-900 dark:text-amber-100">
      This drawing changed in another window. Reload to get the latest (your
      unsaved changes will be lost) or keep editing to overwrite.
    </p>
    <div className="mt-2 flex gap-2">
      <button
        onClick={onReload}
        className="px-3 py-1 rounded border border-amber-600 bg-white dark:bg-neutral-900 text-sm font-semibold text-amber-900 dark:text-amber-100"
      >
        Reload
      </button>
      <button
        onClick={onOverwrite}
        className="px-3 py-1 rounded border border-amber-600 bg-amber-500 text-sm font-semibold text-white"
      >
        Overwrite
      </button>
    </div>
  </div>
);

export default TldrawEditorPage;
