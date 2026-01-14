/**
 * Shared CollectionPicker component
 * Eliminates duplicated collection dropdown UI in DrawingCard and Dashboard
 */
import React from 'react';
import { Folder, Inbox, Check } from 'lucide-react';
import clsx from 'clsx';
import type { Collection } from '../types';

interface CollectionPickerProps {
  collections: Collection[];
  currentCollectionId: string | null;
  onSelect: (collectionId: string | null) => void;
  onClose: () => void;
  position?: 'top' | 'bottom';
  label?: string;
  showIcons?: boolean;
  className?: string;
}

export const CollectionPicker: React.FC<CollectionPickerProps> = ({
  collections,
  currentCollectionId,
  onSelect,
  onClose,
  position = 'bottom',
  label,
  showIcons = false,
  className,
}) => {
  const positionClasses = position === 'top'
    ? 'bottom-full mb-2'
    : 'top-full mt-2';

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div
        className={clsx(
          "absolute right-0 w-48 bg-white dark:bg-neutral-900 rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] z-20 py-1 max-h-56 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100",
          positionClasses,
          className
        )}
      >
        {label && (
          <div className="px-3 py-2 text-[10px] font-bold uppercase text-slate-400 dark:text-neutral-500 tracking-wider border-b border-slate-100 dark:border-neutral-700 mb-1">
            {label}
          </div>
        )}
        <button
          data-testid="collection-option-unorganized"
          onClick={() => { onSelect(null); onClose(); }}
          className={clsx(
            "w-full px-3 py-2 text-xs text-left flex items-center justify-between hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors",
            currentCollectionId === null
              ? "text-neutral-900 dark:text-white font-bold bg-neutral-100 dark:bg-neutral-800"
              : "text-slate-600 dark:text-neutral-400"
          )}
        >
          <span className="flex items-center gap-2">
            {showIcons && <Inbox size={14} />}
            Unorganized
          </span>
          {currentCollectionId === null && <Check size={12} />}
        </button>
        {collections.filter(c => c.name !== 'Trash').map(c => (
          <button
            key={c.id}
            data-testid={`collection-option-${c.id}`}
            onClick={() => { onSelect(c.id); onClose(); }}
            className={clsx(
              "w-full px-3 py-2 text-xs text-left flex items-center justify-between hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors truncate",
              currentCollectionId === c.id
                ? "text-neutral-900 dark:text-white font-bold bg-neutral-100 dark:bg-neutral-800"
                : "text-slate-600 dark:text-neutral-400"
            )}
          >
            <span className="flex items-center gap-2 truncate">
              {showIcons && <Folder size={14} />}
              <span className="truncate">{c.name}</span>
            </span>
            {currentCollectionId === c.id && <Check size={12} />}
          </button>
        ))}
      </div>
    </>
  );
};
