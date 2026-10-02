import React from "react";
import clsx from "clsx";
import type { Collection, DrawingSummary } from "../../types";
import { CollectionMoveOptions } from "./CollectionMoveOptions";

interface CollectionPickerProps {
  drawing: DrawingSummary;
  collections: Collection[];
  isShared: boolean;
  isSharedCollection: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onMoveToCollection: (id: string, collectionId: string | null) => void;
}

export const CollectionPicker: React.FC<CollectionPickerProps> = ({
  drawing,
  collections,
  isShared,
  isSharedCollection,
  isOpen,
  onToggle,
  onClose,
  onMoveToCollection,
}) => {
  const collectionName = drawing.collectionId
    ? collections.find((collection) => collection.id === drawing.collectionId)
        ?.name || "Collection"
    : "Unorganized";

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1 flex-wrap justify-start xs:justify-end">
        <button
          onClick={() => {
            if (isShared || isSharedCollection) return;
            onToggle();
          }}
          data-testid={`collection-picker-${drawing.id}`}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          disabled={isShared || isSharedCollection}
          className={clsx(
            "max-w-[120px] truncate rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-all",
            isShared || isSharedCollection
              ? "bg-slate-50 dark:bg-neutral-800/40 text-slate-400 dark:text-neutral-500 border-neutral-100 dark:border-neutral-800 cursor-not-allowed"
              : "bg-slate-50 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400 cursor-pointer border-neutral-200/60 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-700/50",
          )}
        >
          {isShared ? "Shared" : collectionName}
        </button>

        {drawing.creatorName && (
          <span
            title={drawing.creatorName}
            className="max-w-[120px] truncate rounded-md border border-indigo-100 bg-indigo-50/50 px-2 py-0.5 text-[10px] font-semibold text-indigo-500 dark:border-indigo-900/50 dark:bg-indigo-900/10 dark:text-indigo-400"
          >
            {drawing.creatorName}
          </span>
        )}

        {isSharedCollection &&
          drawing.accessLevel &&
          drawing.accessLevel !== "owner" && (
            <span
              className={clsx(
                "rounded-md border px-2 py-0.5 text-[10px] font-semibold",
                drawing.accessLevel === "edit"
                  ? "bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30"
                  : "bg-amber-50/50 dark:bg-amber-900/10 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/30",
              )}
            >
              {drawing.accessLevel === "edit" ? "Editor" : "Viewer"}
            </span>
          )}
      </div>

      {!isShared && isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={onClose} />
          <div className="ui-menu absolute right-0 bottom-full mb-1.5 w-48 z-20 max-h-56 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-bottom-2 duration-150">
            <CollectionMoveOptions
              collections={collections}
              currentCollectionId={drawing.collectionId}
              drawingId={drawing.id}
              onMoveToCollection={onMoveToCollection}
              onDone={onClose}
              optionClassName="ui-menu-item justify-between text-xs"
              selectedClassName="ui-menu-item-selected"
              unselectedClassName=""
              checkSize={12}
            />
          </div>
        </>
      )}
    </div>
  );
};
