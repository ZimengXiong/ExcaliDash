import React from "react";
import clsx from "clsx";
import { AlertTriangle, Folder, Inbox, Loader2, Trash2 } from "lucide-react";
import { DrawingCard } from "../../components/DrawingCard";
import type { Collection, DrawingSummary } from "../../types";

type DragPreviewProps = {
  drawings: DrawingSummary[];
};

export const DragPreview: React.FC<DragPreviewProps> = ({ drawings }) => (
  <div
    id="drag-preview"
    className="fixed top-[-1000px] left-[-1000px] w-[160px] aspect-[16/10] pointer-events-none"
  >
    {drawings.length > 0 && (
      <div className="relative w-full h-full">
        {drawings.slice(0, 3).map((drawing, index) => (
          <div
            key={drawing.id}
            className="absolute inset-0 bg-slate-50 border-2 border-black rounded-xl shadow-sm flex items-center justify-center overflow-hidden"
            style={{
              transform: `translate(${index * 4}px, ${index * 4}px)`,
              zIndex: 3 - index,
              width: "100%",
              height: "100%",
            }}
          >
            <div className="absolute inset-0 opacity-[0.3] bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] [background-size:24px_24px]" />
            {drawing.preview ? (
              <div
                className="w-full h-full p-2 flex items-center justify-center [&>svg]:w-auto [&>svg]:h-auto [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:drop-shadow-sm relative z-10"
                dangerouslySetInnerHTML={{ __html: drawing.preview }}
              />
            ) : (
              <div className="text-slate-300 relative z-10">
                <Folder size={24} />
              </div>
            )}
          </div>
        ))}
        {drawings.length > 1 && (
          <div className="absolute -top-2 -right-2 bg-indigo-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-sm z-50">
            {drawings.length}
          </div>
        )}
      </div>
    )}
  </div>
);

type ViewerActionToastProps = {
  message: string | null;
};

export const ViewerActionToast: React.FC<ViewerActionToastProps> = ({
  message,
}) => {
  if (!message) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center gap-3 px-5 py-3 bg-amber-50 dark:bg-amber-900/30 border-2 border-amber-500 rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)]">
        <AlertTriangle
          size={18}
          className="text-amber-600 dark:text-amber-400 shrink-0"
          strokeWidth={3}
        />
        <span className="text-sm font-black text-amber-900 dark:text-amber-200">
          {message}
        </span>
      </div>
    </div>
  );
};

type FileDropOverlayProps = {
  viewTitle: string;
};

export const FileDropOverlay: React.FC<FileDropOverlayProps> = ({
  viewTitle,
}) => (
  <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm border-4 border-dashed border-indigo-400 rounded-3xl flex flex-col items-center justify-center animate-in fade-in duration-200">
    <div className="bg-indigo-50 p-6 sm:p-8 rounded-full mb-5 sm:mb-6 shadow-sm">
      <Inbox size={56} className="text-indigo-600 hidden sm:block" />
      <Inbox size={44} className="text-indigo-600 sm:hidden" />
    </div>
    <h3 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-2 text-center px-4">
      Drop files to import
    </h3>
    <p className="text-slate-500 text-base sm:text-lg max-w-sm sm:max-w-md text-center px-4">
      Drop .excalidraw or .json files here to add them to
      <span className="font-bold text-indigo-600 mx-1">{viewTitle}</span>
    </p>
  </div>
);

type DrawingsGridProps = {
  drawings: DrawingSummary[];
  collections: Collection[];
  selectedIds: Set<string>;
  search: string;
  isLoading: boolean;
  isDraggingFile: boolean;
  isTrashView: boolean;
  isSharedView: boolean;
  isSharedCollection: boolean;
  currentCollection?: Collection;
  onClearSearch: () => void;
  onToggleSelection: (id: string, event: React.MouseEvent) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onHide: (id: string) => void;
  onDuplicate: (id: string) => void;
  onMoveToCollection: (id: string, collectionId: string | null) => void;
  onOpenDrawing: (id: string) => void;
  onMouseDown: (event: React.MouseEvent, id: string) => void;
  onDragStart: (event: React.DragEvent, id: string) => void;
  onPreviewGenerated: (id: string, preview: string) => void;
};

export const DrawingsGrid: React.FC<DrawingsGridProps> = ({
  drawings,
  collections,
  selectedIds,
  search,
  isLoading,
  isDraggingFile,
  isTrashView,
  isSharedView,
  isSharedCollection,
  currentCollection,
  onClearSearch,
  onToggleSelection,
  onRename,
  onDelete,
  onHide,
  onDuplicate,
  onMoveToCollection,
  onOpenDrawing,
  onMouseDown,
  onDragStart,
  onPreviewGenerated,
}) => {
  if (isLoading && drawings.length === 0) {
    return (
      <div className="flex justify-center items-center h-64 text-indigo-600">
        <Loader2 size={32} className="animate-spin" />
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "grid gap-3 sm:gap-4 pb-16 sm:pb-24 transition-all duration-300",
        isDraggingFile && "opacity-20 blur-sm",
      )}
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
    >
      {drawings.length === 0 ? (
        <div className="col-span-full flex flex-col items-center justify-center py-16 sm:py-32 text-slate-400 dark:text-neutral-500 border-2 border-dashed border-slate-200 dark:border-neutral-700 rounded-3xl bg-slate-50/50 dark:bg-neutral-800/50">
          <div className="w-20 h-20 bg-white dark:bg-slate-800 rounded-full shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-center mb-6">
            {isTrashView ? (
              <Trash2
                size={32}
                className="text-slate-300 dark:text-slate-600"
              />
            ) : (
              <Inbox size={32} className="text-slate-300 dark:text-slate-600" />
            )}
          </div>
          <p className="text-lg font-semibold text-slate-600 dark:text-slate-400">
            {isTrashView ? "Your trash is empty" : "No drawings found"}
          </p>
          {!isTrashView && (
            <p className="text-sm mt-2 text-slate-400 dark:text-neutral-500 max-w-xs text-center">
              {search
                ? `No results for "${search}"`
                : "Create a new drawing to get started!"}
            </p>
          )}
          {search && (
            <button
              onClick={onClearSearch}
              className="mt-4 text-indigo-600 dark:text-indigo-400 font-medium hover:underline text-sm"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        drawings.map((drawing) => {
          const cardDrawing =
            isSharedCollection && currentCollection?.sharedRole
              ? { ...drawing, accessLevel: currentCollection.sharedRole }
              : drawing;
          return (
            <DrawingCard
              key={drawing.id}
              drawing={cardDrawing}
              collections={collections}
              isSelected={selectedIds.has(drawing.id)}
              isTrash={isTrashView}
              isSharedCollection={isSharedCollection}
              isShared={isSharedView || isSharedCollection}
              onToggleSelection={(event) =>
                onToggleSelection(drawing.id, event)
              }
              onRename={onRename}
              onDelete={onDelete}
              onHide={isSharedView ? onHide : undefined}
              onDuplicate={onDuplicate}
              onMoveToCollection={onMoveToCollection}
              onClick={(id, event) => {
                if (
                  selectedIds.size > 0 ||
                  event.shiftKey ||
                  event.metaKey ||
                  event.ctrlKey
                ) {
                  onToggleSelection(id, event);
                } else {
                  onOpenDrawing(id);
                }
              }}
              onMouseDown={onMouseDown}
              onDragStart={onDragStart}
              onPreviewGenerated={onPreviewGenerated}
            />
          );
        })
      )}
    </div>
  );
};
