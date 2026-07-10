import React from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckSquare,
  ChevronDown,
  Copy,
  Folder,
  Inbox,
  Search,
  Square,
  Trash2,
  Upload,
} from "lucide-react";
import clsx from "clsx";
import type { DrawingSortField, SortDirection } from "../../api";
import type { Collection, DrawingEngine } from "../../types";
import { NewDrawingControl } from "./NewDrawingControl";

type SortOption = {
  field: DrawingSortField;
  label: string;
  icon: React.ReactNode;
};

type DashboardToolbarProps = {
  search: string;
  searchInputRef: React.RefObject<HTMLInputElement>;
  sortConfig: { field: DrawingSortField; direction: SortDirection };
  sortOptions: SortOption[];
  currentSortOption: SortOption;
  showSortMenu: boolean;
  sortedDrawingsCount: number;
  allSelected: boolean;
  hasSelection: boolean;
  isTrashView: boolean;
  isSharedView: boolean;
  isSharedCollection: boolean;
  currentCollection?: Collection;
  showBulkMoveMenu: boolean;
  selectedCount: number;
  collections: Collection[];
  onSearchChange: (value: string) => void;
  onShowSortMenuChange: (value: boolean) => void;
  onSortFieldChange: (field: DrawingSortField) => void;
  onSortDirectionToggle: () => void;
  onSelectAll: () => void;
  onBulkDeleteClick: () => void;
  onBulkDuplicate: () => void;
  onShowBulkMoveMenuChange: (value: boolean) => void;
  onBulkMove: (collectionId: string | null) => void;
  onImportDrawings: (files: FileList | null) => void;
  onCreateDrawing: (engine: DrawingEngine) => void;
  onViewerActionError: (message: string) => void;
};

export const DashboardToolbar: React.FC<DashboardToolbarProps> = ({
  search,
  searchInputRef,
  sortConfig,
  sortOptions,
  currentSortOption,
  showSortMenu,
  sortedDrawingsCount,
  allSelected,
  hasSelection,
  isTrashView,
  isSharedView,
  isSharedCollection,
  currentCollection,
  showBulkMoveMenu,
  selectedCount,
  collections,
  onSearchChange,
  onShowSortMenuChange,
  onSortFieldChange,
  onSortDirectionToggle,
  onSelectAll,
  onBulkDeleteClick,
  onBulkDuplicate,
  onShowBulkMoveMenuChange,
  onBulkMove,
  onImportDrawings,
  onCreateDrawing,
  onViewerActionError,
}) => {
  const canModifySelection =
    !isSharedView &&
    (!isSharedCollection || currentCollection?.sharedRole === "edit");

  return (
    <div className="mb-8 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
      <div className="flex flex-1 w-full lg:w-auto gap-3 items-center flex-wrap">
        <div className="relative flex-1 group max-w-md transition-all duration-200 focus-within:-translate-y-0.5">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search drawings..."
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="w-full pl-10 pr-12 py-2.5 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-xl focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:focus:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] outline-none transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] placeholder:text-slate-400 dark:placeholder:text-neutral-500 text-sm text-slate-900 dark:text-white"
          />
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 dark:text-neutral-500 group-focus-within:text-indigo-500 dark:group-focus-within:text-neutral-300 transition-colors pointer-events-none"
            size={18}
          />
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 -mt-px pointer-events-none">
            <kbd className="hidden sm:inline-flex items-center h-5 px-1.5 text-[10px] font-bold text-slate-400 dark:text-neutral-600 bg-slate-100 dark:bg-neutral-800 border border-slate-300 dark:border-neutral-700 rounded shadow-[0px_2px_0px_0px_rgba(0,0,0,0.05)]">
              <span className="text-xs mr-0.5">⌘</span>K
            </kbd>
          </div>
        </div>
        <div className="flex items-center gap-2 p-1 flex-wrap">
          <div className="relative">
            <button
              onClick={(event) => {
                event.stopPropagation();
                onShowSortMenuChange(!showSortMenu);
              }}
              className={clsx(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all border-2 border-black dark:border-neutral-700 whitespace-nowrap h-[42px] w-full sm:w-[180px]",
                "bg-white dark:bg-neutral-900 text-slate-700 dark:text-neutral-300 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/30",
              )}
            >
              <span className="text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                {currentSortOption.icon}
              </span>
              <span className="whitespace-nowrap flex-1 text-left">
                {currentSortOption.label}
              </span>
              <ChevronDown
                size={16}
                className="text-slate-400 dark:text-neutral-500 flex-shrink-0"
              />
            </button>
            {showSortMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => onShowSortMenuChange(false)}
                />
                <div className="absolute top-full left-0 mt-2 z-50 bg-white dark:bg-neutral-800 rounded-lg border-2 border-black dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] py-1 min-w-[180px]">
                  {sortOptions.map((option) => (
                    <button
                      key={option.field}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSortFieldChange(option.field);
                      }}
                      className={clsx(
                        "w-full px-3 py-2 text-sm text-left flex items-center gap-2 transition-colors",
                        sortConfig.field === option.field
                          ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-bold"
                          : "text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 hover:text-indigo-600 dark:hover:text-indigo-400",
                      )}
                    >
                      <span className="text-indigo-600 dark:text-indigo-400">
                        {option.icon}
                      </span>
                      <span>{option.label}</span>
                      {sortConfig.field === option.field && (
                        <span className="ml-auto text-xs">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            onClick={onSortDirectionToggle}
            className={clsx(
              "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-all border-2 border-black dark:border-neutral-700 h-[42px] min-w-[42px]",
              "bg-white dark:bg-neutral-900 text-indigo-600 dark:text-indigo-400 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/30",
            )}
            title={
              sortConfig.direction === "asc"
                ? "Sort Ascending"
                : "Sort Descending"
            }
          >
            {sortConfig.direction === "asc" ? (
              <ArrowUp size={18} />
            ) : (
              <ArrowDown size={18} />
            )}
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3 w-full lg:w-auto justify-start lg:justify-end flex-wrap">
        <div className="flex items-center gap-2 mr-2">
          <button
            onClick={onSelectAll}
            disabled={sortedDrawingsCount === 0}
            className={clsx(
              "h-[42px] w-[42px] flex items-center justify-center rounded-xl border-2 transition-all",
              sortedDrawingsCount > 0
                ? "bg-white dark:bg-neutral-800 border-black dark:border-neutral-700 text-indigo-600 dark:text-indigo-400 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                : "bg-slate-100 dark:bg-neutral-900 border-slate-300 dark:border-neutral-800 text-slate-300 dark:text-neutral-700 cursor-not-allowed",
            )}
            title={allSelected ? "Deselect All" : "Select All"}
          >
            {allSelected ? <CheckSquare size={20} /> : <Square size={20} />}
          </button>
          <button
            onClick={onBulkDeleteClick}
            disabled={!hasSelection || !canModifySelection}
            className={clsx(
              "h-[42px] w-[42px] flex items-center justify-center rounded-xl border-2 transition-all",
              hasSelection && canModifySelection
                ? "bg-white dark:bg-neutral-800 border-black dark:border-neutral-700 text-rose-600 dark:text-rose-400 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 hover:bg-rose-50 dark:hover:bg-rose-900/30"
                : "bg-slate-100 dark:bg-neutral-900 border-slate-300 dark:border-neutral-800 text-slate-300 dark:text-neutral-700 cursor-not-allowed",
            )}
            title={isTrashView ? "Delete Permanently" : "Move to Trash"}
          >
            <Trash2 size={20} />
          </button>
          <button
            onClick={onBulkDuplicate}
            disabled={!hasSelection || isTrashView || !canModifySelection}
            className={clsx(
              "h-[42px] w-[42px] flex items-center justify-center rounded-xl border-2 transition-all",
              hasSelection && !isTrashView && canModifySelection
                ? "bg-white dark:bg-neutral-800 border-black dark:border-neutral-700 text-indigo-600 dark:text-indigo-400 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                : "bg-slate-100 dark:bg-neutral-900 border-slate-300 dark:border-neutral-800 text-slate-300 dark:text-neutral-700 cursor-not-allowed",
            )}
            title="Duplicate Selected"
          >
            <Copy size={20} />
          </button>
          <div className="relative">
            <button
              onClick={() =>
                hasSelection && onShowBulkMoveMenuChange(!showBulkMoveMenu)
              }
              disabled={!hasSelection || !canModifySelection}
              className={clsx(
                "h-[42px] w-[42px] flex items-center justify-center rounded-xl border-2 transition-all",
                hasSelection && canModifySelection
                  ? "bg-white dark:bg-neutral-800 border-black dark:border-neutral-700 text-emerald-600 dark:text-emerald-400 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                  : "bg-slate-100 dark:bg-neutral-900 border-slate-300 dark:border-neutral-800 text-slate-300 dark:text-neutral-700 cursor-not-allowed",
              )}
              title="Move Selected"
            >
              <div className="relative">
                <Folder size={20} />
                <ArrowRight
                  size={12}
                  className="absolute -bottom-1 -right-1 bg-white dark:bg-slate-800 rounded-full border border-current"
                  strokeWidth={3}
                />
              </div>
            </button>
            {showBulkMoveMenu && hasSelection && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => onShowBulkMoveMenuChange(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-neutral-800 rounded-xl border-2 border-black dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] z-50 py-1 max-h-64 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-2 text-[10px] font-bold uppercase text-slate-400 dark:text-neutral-500 tracking-wider border-b border-slate-100 dark:border-neutral-700 mb-1">
                    Move {selectedCount} items to...
                  </div>
                  <button
                    onClick={() => onBulkMove(null)}
                    className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  >
                    <Inbox size={14} /> Unorganized
                  </button>
                  {collections
                    .filter((collection) => collection.id !== "trash")
                    .map((collection) => (
                      <button
                        key={collection.id}
                        onClick={() => onBulkMove(collection.id)}
                        className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate"
                      >
                        <Folder size={14} />
                        <span className="truncate">{collection.name}</span>
                      </button>
                    ))}
                </div>
              </>
            )}
          </div>
        </div>
        <input
          type="file"
          multiple
          accept=".json,.excalidraw"
          className="hidden"
          id="dashboard-import"
          onChange={(event) => {
            onImportDrawings(event.target.files);
            event.target.value = "";
          }}
        />
        <button
          onClick={() => {
            if (
              isSharedCollection &&
              currentCollection?.sharedRole !== "edit"
            ) {
              onViewerActionError("Viewers can't import drawings");
              return;
            }
            document.getElementById("dashboard-import")?.click();
          }}
          disabled={isTrashView || isSharedView}
          className={clsx(
            "h-[42px] w-full sm:w-auto flex items-center justify-center gap-2 px-6 rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] transition-all font-bold text-sm whitespace-nowrap",
            isTrashView || isSharedView
              ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 border-slate-300 dark:border-slate-700 shadow-none cursor-not-allowed"
              : "bg-emerald-600 dark:bg-neutral-800 text-white hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:active:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]",
          )}
        >
          <Upload size={18} strokeWidth={2.5} /> Import
        </button>
        <NewDrawingControl
          disabled={isTrashView || isSharedView}
          onCreate={onCreateDrawing}
          canCreate={() => {
            if (isSharedCollection && currentCollection?.sharedRole !== "edit") {
              onViewerActionError("Viewers can't create new drawings");
              return false;
            }
            return true;
          }}
        />
      </div>
    </div>
  );
};
