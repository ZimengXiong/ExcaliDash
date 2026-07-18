import React from "react";
import { Edit2, Plus, Share2, Trash2 } from "lucide-react";
import type { Collection } from "../../types";

export type SidebarContextMenuState = {
  x: number;
  y: number;
  type: "item" | "background";
  id?: string;
};

interface SidebarContextMenuProps {
  contextMenu: SidebarContextMenuState;
  collections: Collection[];
  onClose: () => void;
  onCreateCollection: () => void;
  onRenameCollection: (collection: Collection) => void;
  onShareCollection: (id: string) => void;
  onDeleteCollection: (id: string) => void;
}

export const SidebarContextMenu: React.FC<SidebarContextMenuProps> = ({
  contextMenu,
  collections,
  onClose,
  onCreateCollection,
  onRenameCollection,
  onShareCollection,
  onDeleteCollection,
}) => (
  <div
    className="fixed inset-0 z-50"
    onClick={onClose}
    onContextMenu={(e) => {
      e.preventDefault();
      onClose();
    }}
  >
    <div
      className="ui-popover absolute py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
      style={{ top: contextMenu.y, left: contextMenu.x }}
      onClick={(e) => e.stopPropagation()}
    >
      {contextMenu.type === "item" && contextMenu.id ? (
        <>
          <button
            onClick={() => {
              onShareCollection(contextMenu.id!);
              onClose();
            }}
            className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-2"
          >
            <Share2 size={14} /> Share Collection
          </button>
          <button
            onClick={() => {
              const collection = collections.find(
                (c) => c.id === contextMenu.id,
              );
              if (collection) onRenameCollection(collection);
              onClose();
            }}
            className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-2"
          >
            <Edit2 size={14} /> Rename Collection
          </button>
          <button
            onClick={() => {
              onDeleteCollection(contextMenu.id!);
              onClose();
            }}
            className="w-full px-3 py-2 text-sm text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 flex items-center gap-2"
          >
            <Trash2 size={14} /> Delete Collection
          </button>
        </>
      ) : (
        <button
          onClick={() => {
            onCreateCollection();
            onClose();
          }}
          className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-2"
        >
          <Plus size={14} /> New Collection
        </button>
      )}
    </div>
  </div>
);
