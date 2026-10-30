import React, { useEffect, useRef } from "react";
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
import { useLocale } from "../../context/useLocale";

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

const SUBMENU_CLOSE_DELAY_MS = 300;

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
}) => {
  const { t } = useLocale();
  const closeTimer = useRef<number | null>(null);

  const openSubmenu = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    onShowMoveSubmenu(true);
  };

  const scheduleSubmenuClose = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      onShowMoveSubmenu(false);
    }, SUBMENU_CLOSE_DELAY_MS);
  };

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  return createPortal(
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        className="ui-menu absolute w-48 animate-in fade-in zoom-in-95 duration-100"
        style={{ top: position.y, left: position.x }}
        onClick={(e) => e.stopPropagation()}
      >
        {!isTrash &&
        (!isShared ||
          drawing.accessLevel === "edit" ||
          drawing.accessLevel === "owner") ? (
          <button onClick={onRename} className="ui-menu-item">
            <PenTool size={14} /> {t("drawing.menu.rename")}
          </button>
        ) : null}
        {!isShared ? (
          <div
            className="relative"
            onMouseEnter={openSubmenu}
            onMouseLeave={scheduleSubmenuClose}
          >
            <button className="ui-menu-item justify-between">
              <span className="flex items-center gap-2">
                <FolderInput size={14} /> {t("drawing.menu.moveTo")}
              </span>
              <ArrowRight size={12} />
            </button>
            {showMoveSubmenu && (
              <>
                {/* Safe-triangle bridge: invisible hover area connecting the
                    row to its submenu so diagonal mouse moves don't close it. */}
                <div
                  className="absolute left-full top-0 z-40 h-full w-3"
                  onMouseEnter={openSubmenu}
                />
                <div
                  className="ui-menu absolute left-full -top-1 z-50 ml-1.5 max-h-64 w-48 overflow-y-auto"
                  onMouseEnter={openSubmenu}
                  onMouseLeave={scheduleSubmenuClose}
                >
                  <CollectionMoveOptions
                    collections={collections}
                    currentCollectionId={drawing.collectionId}
                    drawingId={drawing.id}
                    onMoveToCollection={onMoveToCollection}
                    onDone={onClose}
                    optionClassName="ui-menu-item justify-between"
                    selectedClassName="ui-menu-item-selected"
                    unselectedClassName=""
                    checkSize={12}
                  />
                </div>
              </>
            )}
          </div>
        ) : null}
        {!isShared ? (
          <>
            <div className="ui-menu-separator" />
            <button
              onClick={() => {
                onDuplicate(drawing.id);
                onClose();
              }}
              className="ui-menu-item"
            >
              <Copy size={14} /> {t("drawing.menu.duplicate")}
            </button>
          </>
        ) : null}
        {!isShared && storageAvailable ? (
          <>
            <button onClick={onManageStorage} className="ui-menu-item">
              <HardDrive size={14} /> {t("drawing.menu.manageStorage")}
            </button>
            <div className="ui-menu-separator" />
          </>
        ) : null}
        <button
          onClick={onExport}
          disabled={isExporting}
          className="ui-menu-item disabled:opacity-50"
        >
          {isExporting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Download size={14} />
          )}
          {isExporting ? t("drawing.menu.exporting") : t("drawing.menu.export")}
        </button>
        {exportError && (
          <div className="mx-1 my-1 rounded-lg border-2 border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-600 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-400">
            {exportError}
          </div>
        )}
        {!isShared ? (
          <>
            <div className="ui-menu-separator" />
            <button
              onClick={() => {
                onDelete(drawing.id);
                onClose();
              }}
              className="ui-menu-item ui-menu-item-danger"
            >
              <Trash2 size={14} /> {t("common.delete")}
            </button>
          </>
        ) : null}
        {isShared && onHide ? (
          <>
            <div className="ui-menu-separator" />
            <button
              onClick={() => {
                onHide(drawing.id);
                onClose();
              }}
              className="ui-menu-item"
            >
              <EyeOff size={14} /> {t("drawing.menu.hide")}
            </button>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
};
