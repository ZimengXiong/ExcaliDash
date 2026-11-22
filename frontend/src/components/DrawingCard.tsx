import React, { memo, useState, useEffect, useCallback } from "react";
import { PenTool, Check, Clock } from "lucide-react";
import type { DrawingSummary, Collection } from "../types";
import { formatDistanceToNow } from "date-fns";
import clsx from "clsx";
import { StorageManageModal } from "./StorageManageModal";
import { CollectionPicker } from "./drawing-card/CollectionPicker";
import { DrawingCardContextMenu } from "./drawing-card/DrawingCardContextMenu";
import { hasCachedDrawingPreview } from "./drawing-card/previewCache";
import { useDrawingPreview } from "./drawing-card/useDrawingPreview";
import { usePreviewVisibility } from "./drawing-card/usePreviewVisibility";
import * as api from "../api";
import { InlineEditInput } from "./InlineEditInput";
import { preloadEditor } from "../editorRoute";

interface DrawingCardProps {
  drawing: DrawingSummary;
  collections: Collection[];
  isSelected: boolean;
  isTrash?: boolean;
  isShared?: boolean;
  isSharedCollection?: boolean;
  sharedRole?: DrawingSummary["accessLevel"];
  onToggleSelection: (id: string, e: React.MouseEvent) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onHide?: (id: string) => void;
  onMoveToCollection: (id: string, collectionId: string | null) => void;
  onDuplicate: (id: string) => void;
  onClick: (drawing: DrawingSummary, e: React.MouseEvent) => void;
  onDragStart?: (e: React.DragEvent, id: string) => void;
  onDragEnd?: () => void;
  onPreviewReady?: (id: string, preview: string) => () => void;
}

export const DrawingCard = memo(function DrawingCard({
  drawing: summary,
  collections,
  isSelected,
  isTrash = false,
  isShared = false,
  isSharedCollection = false,
  sharedRole,
  onToggleSelection,
  onRename,
  onDelete,
  onHide,
  onMoveToCollection,
  onDuplicate,
  onClick,
  onDragStart,
  onDragEnd,
  onPreviewReady,
}: DrawingCardProps) {
  const drawing = sharedRole
    ? { ...summary, accessLevel: sharedRole }
    : summary;
  const [isRenaming, setIsRenaming] = useState(false);
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false);
  const [showCollectionDropdown, setShowCollectionDropdown] = useState(false);
  const [newName, setNewName] = useState(drawing.name);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [storageAvailable, setStorageAvailable] = useState(false);
  const [showStorageModal, setShowStorageModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const { previewContainerRef, isNearViewport, hasBeenNearViewport } =
    usePreviewVisibility(hasCachedDrawingPreview(drawing.id));
  const { previewSvg, buildExportDrawing } = useDrawingPreview(
    drawing,
    hasBeenNearViewport,
  );

  useEffect(() => {
    if (previewSvg) return onPreviewReady?.(drawing.id, previewSvg);
  }, [drawing.id, onPreviewReady, previewSvg]);

  useEffect(() => {
    if (!contextMenu || isShared || isTrash) return;
    let cancelled = false;
    api.isS3Enabled().then((enabled) => {
      if (!cancelled) setStorageAvailable(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, [contextMenu, isShared, isTrash]);

  const handleExport = useCallback(async () => {
    try {
      setIsExporting(true);
      setExportError(null);
      const [{ exportDrawingToFile }, data] = await Promise.all([
        import("../utils/exportUtils"),
        buildExportDrawing(),
      ]);
      await exportDrawingToFile(data);
    } catch (error) {
      console.error("Failed to export drawing", error);
      setExportError("Failed to export drawing. Please try again.");
      setTimeout(() => setExportError(null), 3000);
    } finally {
      setIsExporting(false);
    }
  }, [buildExportDrawing]);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [contextMenu]);

  const startRename = () => {
    setNewName(drawing.name);
    setIsRenaming(true);
  };

  const handleRenameCommit = () => {
    const trimmed = newName.trim();
    setIsRenaming(false);
    if (trimmed && trimmed !== drawing.name) {
      onRename(drawing.id, trimmed);
    } else {
      setNewName(drawing.name);
    }
  };

  const handleRenameCancel = () => {
    setIsRenaming(false);
    setNewName(drawing.name);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
    setShowMoveSubmenu(false);
  };

  const preloadDrawing = () => {
    if (isTrash) return;
    void preloadEditor().catch(() => undefined);
  };

  return (
    <>
      <div
        id={`drawing-card-${drawing.id}`}
        onContextMenu={handleContextMenu}
        onPointerEnter={preloadDrawing}
        onFocus={preloadDrawing}
        draggable={!isRenaming && !isShared}
        onDragStart={(e) => {
          if (isRenaming) {
            e.preventDefault();
            return;
          }
          if (isShared) {
            e.preventDefault();
            return;
          }
          e.dataTransfer.setData("drawingId", drawing.id);
          onDragStart?.(e, drawing.id);
        }}
        onDragEnd={onDragEnd}
        className={clsx(
          "drawing-card group relative flex flex-col bg-white dark:bg-neutral-900 rounded-2xl border-2 transition-all duration-200 ease-out",
          !isTrash &&
            "hover:-translate-y-1 hover:shadow-[3px_3px_0px_0px_rgba(30,41,59,0.9)] dark:hover:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.18)]",
          isTrash &&
            "shadow-[1.5px_1.5px_0px_0px_rgba(30,41,59,0.9)] dark:shadow-[1.5px_1.5px_0px_0px_rgba(255,255,255,0.15)] opacity-80 grayscale-[0.5]",
          isSelected
            ? "border-indigo-600 dark:border-indigo-400 shadow-[3px_3px_0px_0px_rgba(79,70,229,0.9)] dark:shadow-[3px_3px_0px_0px_rgba(129,140,248,0.55)]"
            : "border-slate-800 dark:border-neutral-700 shadow-[1.5px_1.5px_0px_0px_rgba(30,41,59,0.9)] dark:shadow-[1.5px_1.5px_0px_0px_rgba(255,255,255,0.15)]",
        )}
      >
        <div
          className="absolute top-2.5 right-2.5 z-20 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200"
          style={{ opacity: isSelected ? 1 : undefined }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelection(drawing.id, e);
            }}
            data-testid={`select-drawing-${drawing.id}`}
            aria-pressed={isSelected}
            aria-label={`${isSelected ? "Deselect" : "Select"} ${drawing.name}`}
            className={clsx(
              "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 shadow-sm",
              isSelected
                ? "bg-indigo-600 dark:bg-indigo-500 border-slate-800 dark:border-indigo-300/60 text-white scale-110"
                : "bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm border-slate-300 dark:border-neutral-600 hover:border-slate-800 dark:hover:border-neutral-400",
            )}
          >
            {isSelected && <Check size={14} strokeWidth={3} />}
          </button>
        </div>

        <div
          ref={previewContainerRef}
          onClick={(e) => !isTrash && onClick(drawing, e)}
          role={isTrash ? undefined : "button"}
          tabIndex={isTrash ? undefined : 0}
          aria-label={isTrash ? undefined : `Open ${drawing.name}`}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.currentTarget.click();
            }
          }}
          className={clsx(
            "aspect-[16/10] [content-visibility:auto] [contain-intrinsic-size:auto_0px] bg-slate-50 dark:bg-neutral-800/30 relative overflow-hidden flex items-center justify-center border-b-2 border-slate-800 dark:border-neutral-700 rounded-t-xl transition-colors",
            !isTrash &&
              "cursor-pointer group-hover:bg-neutral-100/10 dark:group-hover:bg-neutral-850 active:opacity-70",
            isTrash && "cursor-default",
          )}
        >
          <div className="absolute inset-0 opacity-[0.25] bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] [background-size:24px_24px]"></div>
          {isNearViewport && previewSvg ? (
            <div
              className={clsx(
                "w-full h-full p-4 sm:p-5 flex items-center justify-center [&>svg]:w-auto [&>svg]:h-auto [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:drop-shadow-xs transition-transform duration-550",
                "drawing-preview",
              )}
              dangerouslySetInnerHTML={{ __html: previewSvg }}
            />
          ) : isNearViewport ? (
            <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 bg-white dark:bg-neutral-900 rounded-2xl shadow-sm flex items-center justify-center text-neutral-300 dark:text-neutral-400 border border-neutral-100 dark:border-neutral-800 transform group-hover:scale-105 group-hover:rotate-1 transition-all duration-500">
              <PenTool
                size={32}
                strokeWidth={1.5}
                className="sm:w-9 sm:h-9 lg:w-10 lg:h-10"
              />
            </div>
          ) : null}
        </div>

        <div className="px-4 pt-3.5 pb-3 bg-white dark:bg-neutral-900 rounded-b-2xl relative z-10 flex-1 flex flex-col justify-between gap-2.5">
          <div>
            {isRenaming ? (
              <div
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <InlineEditInput
                  aria-label="Drawing name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onCommit={handleRenameCommit}
                  onCancel={handleRenameCancel}
                  onDragStart={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="w-full px-2 py-1 -ml-2 text-sm sm:text-base font-semibold text-slate-900 dark:text-white border-2 border-slate-800 dark:border-neutral-600 rounded-lg focus:outline-none shadow-[1.5px_1.5px_0px_0px_rgba(30,41,59,0.9)] dark:shadow-[1.5px_1.5px_0px_0px_rgba(255,255,255,0.18)] bg-white dark:bg-neutral-800"
                />
              </div>
            ) : (
              <h3
                className="text-sm sm:text-base font-bold text-slate-800 dark:text-neutral-100 truncate cursor-text select-none group-hover:text-neutral-900 dark:group-hover:text-white transition-colors"
                title={drawing.name}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  const canRename =
                    !isTrash &&
                    (!isShared ||
                      drawing.accessLevel === "edit" ||
                      drawing.accessLevel === "owner");
                  if (canRename) startRename();
                }}
              >
                {drawing.name}
              </h3>
            )}
          </div>

          <div className="relative">
            <div className="flex items-center justify-between gap-2">
              <p
                className="min-w-0 truncate text-[11px] font-medium text-slate-500 dark:text-neutral-400 flex items-center gap-1.5"
                title={new Date(drawing.updatedAt).toLocaleString()}
              >
                <Clock size={11} className="shrink-0" />
                <span className="truncate">
                  {formatDistanceToNow(drawing.updatedAt, { addSuffix: true })}
                </span>
              </p>

              <CollectionPicker
                drawing={drawing}
                collections={collections}
                isShared={isShared}
                isSharedCollection={isSharedCollection}
                isOpen={showCollectionDropdown}
                onToggle={() =>
                  setShowCollectionDropdown(!showCollectionDropdown)
                }
                onClose={() => setShowCollectionDropdown(false)}
                onMoveToCollection={onMoveToCollection}
              />
            </div>
          </div>
        </div>
      </div>

      {contextMenu && (
        <DrawingCardContextMenu
          drawing={drawing}
          collections={collections}
          position={contextMenu}
          isTrash={isTrash}
          isShared={isShared}
          storageAvailable={!isShared && !isTrash && storageAvailable}
          isExporting={isExporting}
          exportError={exportError}
          showMoveSubmenu={showMoveSubmenu}
          onShowMoveSubmenu={setShowMoveSubmenu}
          onClose={() => setContextMenu(null)}
          onRename={() => {
            startRename();
            setContextMenu(null);
          }}
          onMoveToCollection={onMoveToCollection}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onHide={onHide}
          onManageStorage={() => {
            setShowStorageModal(true);
            setContextMenu(null);
          }}
          onExport={async (e) => {
            e.stopPropagation();
            await handleExport();
            setContextMenu(null);
          }}
        />
      )}
      {showStorageModal && (
        <StorageManageModal
          isOpen
          drawingId={drawing.id}
          drawingName={drawing.name}
          onClose={() => setShowStorageModal(false)}
        />
      )}
    </>
  );
});
