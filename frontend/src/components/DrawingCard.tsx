
import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { PenTool, Trash2, FolderInput, ArrowRight, Check, Clock, Copy, Download, Loader2 } from 'lucide-react';
import type { DrawingSummary, Collection, Drawing } from '../types';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { exportToSvg } from "@excalidraw/excalidraw";
import { exportDrawingToFile } from '../utils/exportUtils';

import * as api from '../api';

type HydratedDrawingData = {
  elements: any[];
  appState: any;
  files: Record<string, any>;
};

interface DrawingCardProps {
  drawing: DrawingSummary;
  collections: Collection[];
  isSelected: boolean;
  isTrash?: boolean;
  onToggleSelection: (e: React.MouseEvent) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onMoveToCollection: (id: string, collectionId: string | null) => void;
  onDuplicate: (id: string) => void;
  onClick: (id: string, e: React.MouseEvent) => void;
  onDragStart?: (e: React.DragEvent, id: string) => void;
  onMouseDown?: (e: React.MouseEvent, id: string) => void;
  onPreviewGenerated?: (id: string, preview: string) => void;
}

const ContextMenuPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return createPortal(children, document.body);
};

export const DrawingCard: React.FC<DrawingCardProps> = ({
  drawing,
  collections,
  isSelected,
  isTrash = false,
  onToggleSelection,
  onRename,
  onDelete,
  onMoveToCollection,
  onDuplicate,
  onClick,
  onDragStart,
  onMouseDown,
  onPreviewGenerated,
}) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false);
  const [showCollectionDropdown, setShowCollectionDropdown] = useState(false);
  const [newName, setNewName] = useState(drawing.name);
  const [previewSvg, setPreviewSvg] = useState<string | null>(drawing.preview ?? null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [fullData, setFullData] = useState<HydratedDrawingData | null>(null);

  const fullDataRef = React.useRef(fullData);
  fullDataRef.current = fullData;
  const fullDataPromiseRef = React.useRef<Promise<HydratedDrawingData> | null>(null);

  useEffect(() => {
    setFullData(null);
    fullDataPromiseRef.current = null;
  }, [drawing.id]);

  const drawingIdRef = React.useRef(drawing.id);
  drawingIdRef.current = drawing.id;

  const ensureFullData = useCallback(async (): Promise<HydratedDrawingData> => {
    if (fullDataRef.current) {
      return fullDataRef.current;
    }
    if (fullDataPromiseRef.current) {
      return fullDataPromiseRef.current;
    }
    const currentDrawingId = drawingIdRef.current;
    const promise = api.getDrawing(currentDrawingId).then((fullDrawing) => {
      const payload: HydratedDrawingData = {
        elements: fullDrawing.elements || [],
        appState: fullDrawing.appState || {},
        files: fullDrawing.files || {},
      };
      setFullData(payload);
      fullDataPromiseRef.current = null;
      return payload;
    }).catch((error) => {
      fullDataPromiseRef.current = null;
      throw error;
    });
    fullDataPromiseRef.current = promise;
    return promise;
  }, []); // Stable identity - uses refs internally

  useEffect(() => {
    let cancelled = false;

    if (drawing.preview) {
      setPreviewSvg(drawing.preview);
      return;
    }

    const generatePreview = async () => {
      try {
        const data = await ensureFullData();
        if (cancelled) return;
        if (!data?.elements || !data?.appState) return;

        const svg = await exportToSvg({
          elements: data.elements,
          appState: {
            ...data.appState,
            exportBackground: true,
            viewBackgroundColor: data.appState.viewBackgroundColor || "#ffffff"
          },
          files: data.files || {},
          exportPadding: 10
        });
        if (cancelled) return;
        const previewHtml = svg.outerHTML;
        setPreviewSvg(previewHtml);

        // Save to backend and notify parent
        api.updateDrawing(drawing.id, { preview: previewHtml }).catch(console.error);
        onPreviewGenerated?.(drawing.id, previewHtml);
      } catch (e) {
        if (!cancelled) {
          console.error("Failed to generate preview", e);
        }
      }
    };

    generatePreview();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing.id, drawing.preview, onPreviewGenerated]); // ensureFullData has stable identity via refs

  const handleExport = useCallback(async () => {
    try {
      setIsExporting(true);
      setExportError(null);
      const data = await ensureFullData();
      const drawingPayload: Drawing = {
        ...drawing,
        elements: data.elements || [],
        appState: data.appState || {},
        files: data.files || {},
      };
      exportDrawingToFile(drawingPayload);
    } catch (error) {
      console.error("Failed to export drawing", error);
      setExportError("Failed to export drawing. Please try again.");
      // Clear error after 3 seconds
      setTimeout(() => setExportError(null), 3000);
    } finally {
      setIsExporting(false);
    }
  }, [drawing, ensureFullData]);


  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      onRename(drawing.id, newName);
      setIsRenaming(false);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
    setShowMoveSubmenu(false);
  };

  return (
    <>
      <div
        id={`drawing-card-${drawing.id}`}
        onContextMenu={handleContextMenu}
        draggable={!isRenaming}
        onDragStart={(e) => {
          if (isRenaming) {
            e.preventDefault();
            return;
          }
          e.dataTransfer.setData('drawingId', drawing.id);
          onDragStart?.(e, drawing.id);
        }}
        onMouseDown={(e) => onMouseDown?.(e, drawing.id)}
        className={clsx(
          "drawing-card group relative flex flex-col bg-white dark:bg-neutral-900 rounded-2xl border-2 transition-all duration-200 ease-out",
          !isTrash && "hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]",
          isTrash && "shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] opacity-80 grayscale-[0.5]",
          // "always show the border for trash" -> It already has a border. Maybe "always show shadow"?
          // I added default shadow for trash and reduced opacity to indicate trash state.
          isSelected ? "border-neutral-500 dark:border-neutral-500 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]" : "border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
        )}
      >
        {/* Selection Toggle */}
        <div className="absolute top-2 right-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ opacity: isSelected ? 1 : undefined }}>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSelection(e); }}
            data-testid={`select-drawing-${drawing.id}`}
            aria-pressed={isSelected}
            aria-label={`${isSelected ? "Deselect" : "Select"} ${drawing.name}`}
            className={clsx(
              "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 shadow-sm",
              isSelected ? "bg-neutral-600 dark:bg-neutral-500 border-neutral-600 dark:border-neutral-500 text-white" : "bg-white dark:bg-neutral-800 border-slate-300 dark:border-neutral-600 hover:border-neutral-500 dark:hover:border-neutral-400"
            )}
          >
            {isSelected && <Check size={14} strokeWidth={3} />}
          </button>
        </div>

        {/* Preview Area */}
        <div
          onClick={(e) => !isTrash && onClick(drawing.id, e)}
          className={clsx(
            "aspect-[16/10] bg-slate-50 dark:bg-neutral-800/50 relative overflow-hidden flex items-center justify-center border-b-2 border-black dark:border-neutral-700 rounded-t-xl transition-colors",
            !isTrash && "cursor-pointer group-hover:bg-neutral-100/30 dark:group-hover:bg-neutral-800",
            isTrash && "cursor-default"
          )}
        >
          {/* Placeholder Grid Pattern */}
          <div className="absolute inset-0 opacity-[0.3] bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] [background-size:24px_24px]"></div>

          {previewSvg ? (
            <div
              className="w-full h-full p-6 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:object-contain [&>svg]:drop-shadow-sm dark:[&>svg]:invert dark:[&>svg_rect[fill='white']]:opacity-0 dark:[&>svg_rect[fill='#ffffff']]:opacity-0 transition-transform duration-500 group-hover:scale-105"
              dangerouslySetInnerHTML={{ __html: previewSvg }}
            />
          ) : (
            <div className="w-24 h-24 bg-white dark:bg-neutral-900 rounded-2xl shadow-sm flex items-center justify-center text-neutral-300 dark:text-neutral-400 border border-slate-100 dark:border-neutral-700 transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
              <PenTool size={40} strokeWidth={1.5} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 bg-white dark:bg-neutral-900 rounded-b-2xl relative z-10">
          {isRenaming ? (
            <form
              onSubmit={handleRenameSubmit}
              onClick={e => e.stopPropagation()}
              onPointerDown={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
            >
              <input
                autoFocus
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={() => setIsRenaming(false)}
                onDragStart={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className="w-full px-2 py-1 -ml-2 text-base font-bold text-slate-900 dark:text-white border-2 border-black dark:border-neutral-600 rounded-lg focus:outline-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] bg-white dark:bg-neutral-800"
              />
            </form>
          ) : (
            <h3
              className="text-base font-bold text-slate-800 dark:text-neutral-100 truncate cursor-text select-none group-hover:text-neutral-900 dark:group-hover:text-white transition-colors"
              title={drawing.name}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsRenaming(true);
              }}
            >
              {drawing.name}
            </h3>
          )}
          <div className="flex items-center justify-between mt-3 relative">
            <p className="text-[11px] font-medium text-slate-400 dark:text-neutral-500 flex items-center gap-1.5">
              <Clock size={11} />
              {formatDistanceToNow(drawing.updatedAt)} ago
            </p>

            <div className="relative" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setShowCollectionDropdown(!showCollectionDropdown)}
                data-testid={`collection-picker-${drawing.id}`}
                aria-haspopup="listbox"
                aria-expanded={showCollectionDropdown}
                className="px-2 py-1 rounded-md bg-slate-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-200 text-slate-500 dark:text-neutral-400 text-[10px] font-bold uppercase tracking-wide max-w-[120px] truncate transition-all cursor-pointer border border-slate-100 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600"
              >
                {drawing.collectionId ? (collections.find(c => c.id === drawing.collectionId)?.name || 'Collection') : 'Unorganized'}
              </button>

              {showCollectionDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowCollectionDropdown(false)} />
                  <div className="absolute right-0 bottom-8 w-48 bg-white dark:bg-neutral-900 rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] z-20 py-1 max-h-56 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100">
                    <button
                      data-testid="collection-option-unorganized"
                      onClick={() => { onMoveToCollection(drawing.id, null); setShowCollectionDropdown(false); }}
                      className={clsx(
                        "w-full px-3 py-2 text-xs text-left flex items-center justify-between hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors",
                        drawing.collectionId === null ? "text-neutral-900 dark:text-white font-bold bg-neutral-100 dark:bg-neutral-800" : "text-slate-600 dark:text-neutral-400"
                      )}
                    >
                      Unorganized
                      {drawing.collectionId === null && <Check size={12} />}
                    </button>
                    {collections.map(c => (
                      <button
                        key={c.id}
                        data-testid={`collection-option-${c.id}`}
                        onClick={() => { onMoveToCollection(drawing.id, c.id); setShowCollectionDropdown(false); }}
                        className={clsx(
                          "w-full px-3 py-2 text-xs text-left flex items-center justify-between hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors truncate",
                          drawing.collectionId === c.id ? "text-neutral-900 dark:text-white font-bold bg-neutral-100 dark:bg-neutral-800" : "text-slate-600 dark:text-neutral-400"
                        )}
                      >
                        <span className="truncate">{c.name}</span>
                        {drawing.collectionId === c.id && <Check size={12} />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Context Menu Portal */}
      {contextMenu && (
        <ContextMenuPortal>
          <div
            className="fixed inset-0 z-50"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
          >
            <div
              className="absolute bg-white dark:bg-neutral-900 rounded-lg border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  setIsRenaming(true);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white flex items-center gap-2"
              >
                <PenTool size={14} /> Rename
              </button>

              <div
                className="relative group/move"
                onMouseEnter={() => setShowMoveSubmenu(true)}
                onMouseLeave={() => setShowMoveSubmenu(false)}
              >
                <button
                  className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white flex items-center justify-between"
                >
                  <span className="flex items-center gap-2"><FolderInput size={14} /> Move to...</span>
                  <ArrowRight size={12} />
                </button>

                {showMoveSubmenu && (
                  <div className="absolute left-full top-0 ml-1 w-40 bg-white dark:bg-neutral-900 rounded-lg border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] py-1 max-h-64 overflow-y-auto">
                    <button
                      onClick={() => { onMoveToCollection(drawing.id, null); setContextMenu(null); }}
                      className={clsx(
                        "w-full px-3 py-1.5 text-xs text-left flex items-center justify-between hover:bg-neutral-100 dark:hover:bg-neutral-800",
                        drawing.collectionId === null ? "text-neutral-900 dark:text-white font-medium" : "text-slate-600 dark:text-neutral-400"
                      )}
                    >
                      Unorganized
                      {drawing.collectionId === null && <Check size={10} />}
                    </button>
                    {collections.map(c => (
                      <button
                        key={c.id}
                        onClick={() => { onMoveToCollection(drawing.id, c.id); setContextMenu(null); }}
                        className={clsx(
                          "w-full px-3 py-1.5 text-xs text-left flex items-center justify-between hover:bg-neutral-100 dark:hover:bg-neutral-800 truncate",
                          drawing.collectionId === c.id ? "text-neutral-900 dark:text-white font-medium" : "text-slate-600 dark:text-neutral-400"
                        )}
                      >
                        <span className="truncate">{c.name}</span>
                        {drawing.collectionId === c.id && <Check size={10} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-50 dark:border-slate-700 my-1"></div>

              <button
                onClick={() => {
                  onDuplicate(drawing.id);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white flex items-center gap-2"
              >
                <Copy size={14} /> Duplicate
              </button>

              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  await handleExport();
                  setContextMenu(null);
                }}
                disabled={isExporting}
                className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                {isExporting ? 'Exporting...' : 'Export'}
              </button>
              {exportError && (
                <div className="px-3 py-2 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20">
                  {exportError}
                </div>
              )}

              <div className="border-t border-slate-50 dark:border-slate-700 my-1"></div>

              <button
                onClick={() => {
                  onDelete(drawing.id);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-2 text-sm text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 flex items-center gap-2"
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        </ContextMenuPortal>
      )}
    </>
  );
};

