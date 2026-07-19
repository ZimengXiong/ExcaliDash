import React from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckSquare,
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
import { PlayfulSelect } from "../../components/PlayfulSelect";
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
  currentSortOption?: SortOption;
  showSortMenu?: boolean;
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
  onShowSortMenuChange?: (value: boolean) => void;
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
          <PlayfulSelect
            ariaLabel="Sort drawings"
            value={sortConfig.field}
            onChange={(value) => onSortFieldChange(value as DrawingSortField)}
            options={sortOptions.map((option) => ({
              value: option.field,
              label: option.label,
              icon: option.icon,
            }))}
            buttonClassName="h-[42px] w-full sm:w-[190px] px-3"
            menuClassName="min-w-[190px]"
          />
          <button
            onClick={onSortDirectionToggle}
            className={clsx(
              "ui-icon-button h-[42px] min-w-[42px] text-indigo-600 dark:text-indigo-400",
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
              "ui-icon-button h-[42px] w-[42px]",
              sortedDrawingsCount > 0
                ? "text-indigo-600 dark:text-indigo-400"
                : "",
            )}
            title={allSelected ? "Deselect All" : "Select All"}
          >
            {allSelected ? <CheckSquare size={20} /> : <Square size={20} />}
          </button>
          <button
            onClick={onBulkDeleteClick}
            disabled={!hasSelection || !canModifySelection}
            className={clsx(
              "ui-icon-button h-[42px] w-[42px]",
              hasSelection && canModifySelection
                ? "text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                : "",
            )}
            title={isTrashView ? "Delete Permanently" : "Move to Trash"}
          >
            <Trash2 size={20} />
          </button>
          <button
            onClick={onBulkDuplicate}
            disabled={!hasSelection || isTrashView || !canModifySelection}
            className={clsx(
              "ui-icon-button h-[42px] w-[42px]",
              hasSelection && !isTrashView && canModifySelection
                ? "text-indigo-600 dark:text-indigo-400"
                : "",
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
                "ui-icon-button h-[42px] w-[42px]",
                hasSelection && canModifySelection
                  ? "text-indigo-600 dark:text-indigo-400"
                  : "",
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
                <div className="ui-menu absolute right-0 top-full mt-2 w-56 z-50 max-h-64 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-400 dark:text-neutral-500">
                    Move {selectedCount} items to...
                  </div>
                  <button onClick={() => onBulkMove(null)} className="ui-menu-item">
                    <Inbox size={14} /> Unorganized
                  </button>
                  {collections
                    .filter((collection) => collection.id !== "trash")
                    .map((collection) => (
                      <button
                        key={collection.id}
                        onClick={() => onBulkMove(collection.id)}
                        className="ui-menu-item"
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
          accept=".excalidash"
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
            "ui-button-secondary h-[42px] w-full px-6 sm:w-auto",
            isTrashView || isSharedView
              ? ""
              : "text-indigo-700 dark:text-indigo-300",
          )}
        >
          <Upload size={18} strokeWidth={2.5} /> Import .excalidash
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
