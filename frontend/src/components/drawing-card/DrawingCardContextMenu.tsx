import React from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Copy,
  Download,
  EyeOff,
  FolderInput,
  HardDrive,
  Loader2,
  PenTool,
  Trash2,
} from "lucide-react";
import type { Collection, DrawingSummary } from "../../types";
import { CollectionMoveOptions } from "./CollectionMoveOptions";

interface DrawingCardContextMenuProps {
  drawing: DrawingSummary;
  collections: Collection[];
  position: { x: number; y: number };
  isTrash: boolean;
  isShared: boolean;
  storageAvailable: boolean;
  isExporting: boolean;
  exportError: string | null;
  showMoveSubmenu: boolean;
  onShowMoveSubmenu: (show: boolean) => void;
  onClose: () => void;
  onRename: () => void;
  onMoveToCollection: (id: string, collectionId: string | null) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onHide?: (id: string) => void;
  onManageStorage: () => void;
  onExport: (e: React.MouseEvent) => Promise<void>;
}

export const DrawingCardContextMenu: React.FC<DrawingCardContextMenuProps> = ({
  drawing,
  collections,
  position,
  isTrash,
  isShared,
  storageAvailable,
  isExporting,
  exportError,
  showMoveSubmenu,
  onShowMoveSubmenu,
  onClose,
  onRename,
  onMoveToCollection,
  onDuplicate,
  onDelete,
  onHide,
  onManageStorage,
  onExport,
}) =>
  createPortal(
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        className="absolute bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-lg py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
        style={{ top: position.y, left: position.x }}
        onClick={(e) => e.stopPropagation()}
      >
        {!isTrash &&
        (!isShared ||
          drawing.accessLevel === "edit" ||
          drawing.accessLevel === "owner") ? (
          <button
            onClick={onRename}
            className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white flex items-center gap-2"
          >
            <PenTool size={14} /> Rename
          </button>
        ) : null}
        {!isShared ? (
          <div
            className="relative group/move"
            onMouseEnter={() => onShowMoveSubmenu(true)}
            onMouseLeave={() => onShowMoveSubmenu(false)}
          >
            <button className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FolderInput size={14} /> Move to...
              </span>
              <ArrowRight size={12} />
            </button>
            {showMoveSubmenu && (
              <div className="absolute left-full top-0 ml-1 w-40 bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-lg py-1 max-h-64 overflow-y-auto">
                <CollectionMoveOptions
                  collections={collections}
                  currentCollectionId={drawing.collectionId}
                  drawingId={drawing.id}
                  onMoveToCollection={onMoveToCollection}
                  onDone={onClose}
                  optionClassName="w-full px-3 py-1.5 text-xs text-left flex items-center justify-between hover:bg-neutral-100 dark:hover:bg-neutral-800 truncate"
                  selectedClassName="text-neutral-900 dark:text-white font-medium"
                  unselectedClassName="text-slate-600 dark:text-neutral-400"
                  checkSize={10}
                />
              </div>
            )}
          </div>
        ) : null}
        {!isShared ? (
          <>
            <div className="border-t border-slate-50 dark:border-slate-800 my-1"></div>
            <button
              onClick={() => {
                onDuplicate(drawing.id);
                onClose();
              }}
              className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white flex items-center gap-2"
            >
              <Copy size={14} /> Duplicate
            </button>
          </>
        ) : null}
        {!isShared && storageAvailable ? (
          <>
            <button
              onClick={onManageStorage}
              className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white flex items-center gap-2"
            >
              <HardDrive size={14} /> Manage storage
            </button>
            <div className="border-t border-slate-50 dark:border-slate-800 my-1"></div>
          </>
        ) : null}
        <button
          onClick={onExport}
          disabled={isExporting}
          className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isExporting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Download size={14} />
          )}
          {isExporting ? "Exporting..." : "Export"}
        </button>
        {exportError && (
          <div className="px-3 py-2 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20">
            {exportError}
          </div>
        )}
        {!isShared ? (
          <>
            <div className="border-t border-slate-50 dark:border-slate-800 my-1"></div>
            <button
              onClick={() => {
                onDelete(drawing.id);
                onClose();
              }}
              className="w-full px-3 py-2 text-sm text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 flex items-center gap-2"
            >
              <Trash2 size={14} /> Delete
            </button>
          </>
        ) : null}
        {isShared && onHide ? (
          <>
            <div className="border-t border-slate-50 dark:border-slate-800 my-1"></div>
            <button
              onClick={() => {
                onHide(drawing.id);
                onClose();
              }}
              className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white flex items-center gap-2"
            >
              <EyeOff size={14} /> Hide from my list
            </button>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
