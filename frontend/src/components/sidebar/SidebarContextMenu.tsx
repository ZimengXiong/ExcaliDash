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
      className="ui-menu absolute w-52 animate-in fade-in zoom-in-95 duration-100"
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
            className="ui-menu-item"
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
            className="ui-menu-item"
          >
            <Edit2 size={14} /> Rename Collection
          </button>
          <div className="ui-menu-separator" />
          <button
            onClick={() => {
              onDeleteCollection(contextMenu.id!);
              onClose();
            }}
            className="ui-menu-item ui-menu-item-danger"
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
          className="ui-menu-item"
        >
          <Plus size={14} /> New Collection
        </button>
      )}
    </div>
  </div>
);
