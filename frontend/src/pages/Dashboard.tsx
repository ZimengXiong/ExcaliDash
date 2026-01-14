import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Layout } from '../components/Layout';
import { DrawingCard } from '../components/DrawingCard';
import { Plus, Search, Loader2, Inbox, Trash2, Folder, ArrowRight, Copy, Upload } from 'lucide-react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import * as api from '../api';
import type { DrawingSummary, Collection } from '../types';
import { useDebounce } from '../hooks/useDebounce';
import clsx from 'clsx';
import { ConfirmModal } from '../components/ConfirmModal';
import { useUpload } from '../context/UploadContext';

type Point = { x: number; y: number };

type SelectionBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

const getSelectionBounds = (start: Point, current: Point): SelectionBounds => {
  const left = Math.min(start.x, current.x);
  const right = Math.max(start.x, current.x);
  const top = Math.min(start.y, current.y);
  const bottom = Math.max(start.y, current.y);
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
};

const DragOverlayPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return createPortal(children, document.body);
};

export const Dashboard: React.FC = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawings, setDrawings] = useState<DrawingSummary[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);

  const selectedCollectionId = React.useMemo(() => {
    if (location.pathname === '/') return undefined;
    if (location.pathname === '/collections') {
      const id = searchParams.get('id');
      if (id === 'unorganized') return null;
      return id || undefined;
    }
    return undefined;
  }, [location.pathname, searchParams]);

  const setSelectedCollectionId = (id: string | null | undefined) => {
    if (id === undefined) {
      navigate('/');
    } else if (id === null) {
      navigate('/collections?id=unorganized');
    } else {
      navigate(`/collections?id=${id}`);
    }
  };

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [showBulkMoveMenu, setShowBulkMoveMenu] = useState(false);

  const [drawingToDelete, setDrawingToDelete] = useState<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const [showImportError, setShowImportError] = useState<{ isOpen: boolean; message: string }>({ isOpen: false, message: '' });

  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragCurrent, setDragCurrent] = useState<Point | null>(null);
  const [potentialDragId, setPotentialDragId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  type SortField = 'name' | 'createdAt' | 'updatedAt';
  type SortDirection = 'asc' | 'desc';


  const searchInputRef = useRef<HTMLInputElement>(null);

  const [sortConfig, setSortConfig] = useState<{ field: SortField; direction: SortDirection }>({
    field: 'updatedAt',
    direction: 'desc'
  });

  const [isLoading, setIsLoading] = useState(false);

  const { uploadFiles } = useUpload();

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [drawingsData, collectionsData] = await Promise.all([
        api.getDrawings(debouncedSearch, selectedCollectionId),
        api.getCollections()
      ]);
      setDrawings(drawingsData);
      setCollections(collectionsData);
      setSelectedIds(new Set());
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, selectedCollectionId]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      dragCounter.current += 1;
      if (dragCounter.current === 1) {
        setIsDraggingFile(true);
      }
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      dragCounter.current -= 1;
      if (dragCounter.current === 0) {
        setIsDraggingFile(false);
      }
    }
  }, []);

  const selectionBounds = React.useMemo<SelectionBounds | null>(() => {
    if (!dragStart || !dragCurrent) return null;
    return getSelectionBounds(dragStart, dragCurrent);
  }, [dragStart, dragCurrent]);

  useEffect(() => {
    if (!isDragSelecting) return;

    const handleMouseMove = (e: MouseEvent) => {
      setDragCurrent({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = (_: MouseEvent) => {
      if (!dragStart || !dragCurrent) {
        setIsDragSelecting(false);
        setDragStart(null);
        setDragCurrent(null);
        return;
      }

      const selectionRect = getSelectionBounds(dragStart, dragCurrent);

      if (selectionRect.width > 5 || selectionRect.height > 5) {
        const newSelectedIds = new Set(selectedIds);
        drawings.forEach(drawing => {
          const card = document.getElementById(`drawing-card-${drawing.id}`);
          if (card) {
            const rect = card.getBoundingClientRect();
            if (
              rect.left < selectionRect.right &&
              rect.right > selectionRect.left &&
              rect.top < selectionRect.bottom &&
              rect.bottom > selectionRect.top
            ) {
              newSelectedIds.add(drawing.id);
            }
          }
        });
        setSelectedIds(newSelectedIds);
      }

      setIsDragSelecting(false);
      setDragStart(null);
      setDragCurrent(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragSelecting, dragStart, dragCurrent, drawings, selectedIds]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a, input, textarea, .drawing-card')) return;
    if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) return;

    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
      setSelectedIds(new Set());
    }
    setPotentialDragId(null);
    setIsDragSelecting(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setDragCurrent({ x: e.clientX, y: e.clientY });
  };

  const sortedDrawings = React.useMemo(() => {
    return [...drawings].sort((a, b) => {
      const { field, direction } = sortConfig;
      const modifier = direction === 'asc' ? 1 : -1;
      if (field === 'name') return a.name.localeCompare(b.name) * modifier;
      if (field === 'createdAt') return (a.createdAt - b.createdAt) * modifier;
      if (field === 'updatedAt') return (a.updatedAt - b.updatedAt) * modifier;
      return 0;
    });
  }, [drawings, sortConfig]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+A or Ctrl+A to Select All
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        // Don't select all if user is typing in an input
        if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) {
          return;
        }
        e.preventDefault();
        const allIds = new Set(sortedDrawings.map(d => d.id));
        setSelectedIds(allIds);
      }

      // Escape to Clear Selection
      if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedIds(new Set());
        setLastSelectedId(null);
      }

      // Cmd+K to Search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sortedDrawings]);

  const handleSort = (field: SortField) => {
    setSortConfig(current => {
      if (current.field === field) return { ...current, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      const defaultDirection = field === 'name' ? 'asc' : 'desc';
      return { field, direction: defaultDirection };
    });
  };

  const SortButton = ({ field, label }: { field: SortField; label: string }) => {
    const isActive = sortConfig.field === field;
    return (
      <button
        onClick={() => handleSort(field)}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-all border-2 border-black dark:border-neutral-700
          ${isActive
            ? 'bg-indigo-100 dark:bg-neutral-800 text-indigo-900 dark:text-neutral-200 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] -translate-y-0.5'
            : 'bg-white dark:bg-neutral-900 text-slate-600 dark:text-neutral-400 hover:bg-slate-50 dark:hover:bg-neutral-800 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5'
          }
        `}
      >
        {label}
        <div className="flex flex-col -space-y-1">
          <svg className={`w-2.5 h-2.5 ${isActive && sortConfig.direction === 'asc' ? 'text-indigo-600 dark:text-neutral-200' : 'text-slate-400 dark:text-neutral-600'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>
          <svg className={`w-2.5 h-2.5 ${isActive && sortConfig.direction === 'desc' ? 'text-indigo-600 dark:text-neutral-200' : 'text-slate-400 dark:text-neutral-600'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </div>
      </button>
    );
  };

  
    const isTrashView = selectedCollectionId === 'trash';
  const handleCreateDrawing = async () => {
    if (isTrashView) return;
    try {
      const targetCollectionId = selectedCollectionId === undefined ? null : selectedCollectionId;
      const { id } = await api.createDrawing('Untitled Drawing', targetCollectionId);
      navigate(`/editor/${id}`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleImportDrawings = async (files: FileList | null) => {
    if (!files || isTrashView) return;

    const fileArray = Array.from(files);
    const targetCollectionId = selectedCollectionId === undefined ? null : selectedCollectionId;
    
    // Use the global upload context
    uploadFiles(fileArray, targetCollectionId).finally(() => {
      // Refresh after all uploads complete (success or failure)
      refreshData();
    });
  };

  const handleRenameDrawing = async (id: string, name: string) => {
    setDrawings(prev => prev.map(d => d.id === id ? { ...d, name } : d));
    await api.updateDrawing(id, { name });
  };

  const handleDeleteDrawing = async (id: string) => {
    if (isTrashView) {
      // Permanent Delete -> Confirm first
      setDrawingToDelete(id);
    } else {
      // Move to Trash -> No Confirm
      const trashId = 'trash';

      // Optimistic Remove from current view
      setDrawings(prev => prev.filter(d => d.id !== id));
      setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s; });

      try {
        await api.updateDrawing(id, { collectionId: trashId });
      } catch (err) {
        console.error("Failed to move to trash", err);
        refreshData();
      }
    }
  };

  const executePermanentDelete = async (id: string) => {
    setDrawings(prev => prev.filter(d => d.id !== id));
    setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    setDrawingToDelete(null); // Close modal immediately

    try {
      await api.deleteDrawing(id);
    } catch (err) {
      console.error("Failed to delete drawing", err);
      refreshData();
    }
  };

  const handleToggleSelection = (id: string, e: React.MouseEvent) => {
    setSelectedIds(prev => {
      const next = new Set(prev);

      // Handle Shift+Select
      if (e.shiftKey && lastSelectedId && sortedDrawings.some(d => d.id === lastSelectedId)) {
        const currentIndex = sortedDrawings.findIndex(d => d.id === id);
        const lastIndex = sortedDrawings.findIndex(d => d.id === lastSelectedId);

        if (currentIndex !== -1 && lastIndex !== -1) {
          const start = Math.min(currentIndex, lastIndex);
          const end = Math.max(currentIndex, lastIndex);

          for (let i = start; i <= end; i++) {
            next.add(sortedDrawings[i].id);
          }
          return next;
        }
      }

      if (next.has(id)) {
        next.delete(id);
        setLastSelectedId(null);
      } else {
        next.add(id);
        setLastSelectedId(id);
      }
      return next;
    });
  };

  const handleBulkDeleteClick = () => {
    if (selectedIds.size === 0) return;
    if (isTrashView) {
      setShowBulkDeleteConfirm(true);
    } else {
      executeBulkMoveToTrash();
    }
  };

  const executeBulkMoveToTrash = async () => {
    const trashId = 'trash';
    const ids = Array.from(selectedIds);

    setDrawings(prev => prev.filter(d => !selectedIds.has(d.id)));
    setSelectedIds(new Set());

    try {
      await Promise.all(ids.map(id => api.updateDrawing(id, { collectionId: trashId })));
    } catch (err) {
      console.error("Failed bulk move to trash", err);
      refreshData();
    }
  };

  const executeBulkPermanentDelete = async () => {
    const ids = Array.from(selectedIds);
    setDrawings(prev => prev.filter(d => !selectedIds.has(d.id)));
    setSelectedIds(new Set());
    setShowBulkDeleteConfirm(false);

    try {
      await Promise.all(ids.map(id => api.deleteDrawing(id)));
    } catch (err) {
      console.error("Failed bulk delete", err);
      refreshData();
    }
  };

  const handleBulkMove = async (collectionId: string | null) => {
    if (selectedIds.size === 0) return;

    const idsToMove = Array.from(selectedIds);

    // Optimistic update
    setDrawings(prev => {
      const updated = prev.map(d => selectedIds.has(d.id) ? { ...d, collectionId } : d);
      if (selectedCollectionId === undefined) return updated;
      return updated.filter(d => {
        if (selectedCollectionId === null) return d.collectionId === null;
        return d.collectionId === selectedCollectionId;
      });
    });
    setSelectedIds(new Set()); // Clear selection after move
    setShowBulkMoveMenu(false);

    try {
      await Promise.all(idsToMove.map(id => api.updateDrawing(id, { collectionId })));
    } catch (err) {
      console.error("Failed bulk move", err);
      refreshData();
    }
  };

  const handleDuplicateDrawing = async (id: string) => {
    try {
      await api.duplicateDrawing(id);
      refreshData();
    } catch (err) {
      console.error("Failed to duplicate drawing:", err);
    }
  };

  const handleBulkDuplicate = async () => {
    if (selectedIds.size === 0) return;

    try {
      const ids = Array.from(selectedIds);
      await Promise.all(ids.map(id => api.duplicateDrawing(id)));
      setSelectedIds(new Set());
      refreshData();
    } catch (err) {
      console.error("Failed bulk duplicate:", err);
    }
  };

  const handleMoveToCollection = async (id: string, collectionId: string | null) => {
    setDrawings(prev => {
      return prev.map(d => d.id === id ? { ...d, collectionId } : d)
        .filter(d => {
          if (selectedCollectionId === undefined) return true;
          if (selectedCollectionId === null) return d.collectionId === null;
          return d.collectionId === selectedCollectionId;
        });
    });
    try {
      await api.updateDrawing(id, { collectionId });
    } catch (error) {
      console.error("Failed to move drawing:", error);
      refreshData();
    }
  };

  const handleCreateCollection = async (name: string) => {
    await api.createCollection(name);
    const newCollections = await api.getCollections();
    setCollections(newCollections);
  };

  const handleEditCollection = async (id: string, name: string) => {
    setCollections(prev => prev.map(c => c.id === id ? { ...c, name } : c));
    await api.updateCollection(id, name);
  };

  const handleDeleteCollection = async (id: string) => {
    setCollections(prev => prev.filter(c => c.id !== id));
    if (selectedCollectionId === id) {
      setSelectedCollectionId(undefined);
    }
    await api.deleteCollection(id);
    refreshData();
  };

  const viewTitle = React.useMemo(() => {
    if (selectedCollectionId === undefined) return "All Drawings";
    if (selectedCollectionId === null) return "Unorganized";
    if (selectedCollectionId === 'trash') return "Trash";
    const collection = collections.find(c => c.id === selectedCollectionId);
    return collection ? collection.name : "Collection";
  }, [selectedCollectionId, collections]);

  const hasSelection = selectedIds.size > 0;

  const handleDrop = async (e: React.DragEvent, targetCollectionId: string | null) => {
    e.preventDefault();
    e.stopPropagation();

    // Handle Files
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      
      const libFiles = files.filter(f => f.name.endsWith('.excalidrawlib'));
      if (libFiles.length > 0) {
        setShowImportError({
          isOpen: true,
          message: 'Library (.excalidrawlib) imports are not supported in this build. Please import drawings (.excalidraw/.json) instead.'
        });
      }

      const drawingFiles = files.filter(f => !f.name.endsWith('.excalidrawlib'));
      if (drawingFiles.length > 0) {
        uploadFiles(drawingFiles, targetCollectionId).finally(() => {
          refreshData();
        });
      }

      return;
    }

    const draggedDrawingId = e.dataTransfer.getData('drawingId');
    if (!draggedDrawingId) return;

    let idsToMove = new Set<string>();

    if (selectedIds.has(draggedDrawingId)) {
      idsToMove = new Set(selectedIds);
    } else {
      // Otherwise move just the dragged item
      idsToMove.add(draggedDrawingId);
    }

    // Optimistic Update
    setDrawings(prev => {
      const updated = prev.map(d => idsToMove.has(d.id) ? { ...d, collectionId: targetCollectionId } : d);
      if (selectedCollectionId === undefined) return updated;
      return updated.filter(d => {
        if (selectedCollectionId === null) return d.collectionId === null;
        return d.collectionId === selectedCollectionId;
      });
    });

    // Clear selection if we moved selected items
    if (selectedIds.has(draggedDrawingId)) {
      setSelectedIds(new Set());
    }

    try {
      await Promise.all(Array.from(idsToMove).map(id => api.updateDrawing(id, { collectionId: targetCollectionId })));
    } catch (err) {
      console.error("Failed to move", err);
      refreshData();
    }
  };

  const dragPreviewDrawings = React.useMemo(() => {
    if (!potentialDragId) return [];
    if (selectedIds.has(potentialDragId) && selectedIds.size > 1) {
      return drawings.filter(d => selectedIds.has(d.id));
    }
    const drawing = drawings.find(d => d.id === potentialDragId);
    return drawing ? [drawing] : [];
  }, [potentialDragId, selectedIds, drawings]);

  const handleCardMouseDown = (_e: React.MouseEvent, id: string) => {
    setPotentialDragId(id);
  };

  const handleCardDragStart = (e: React.DragEvent, _id: string) => {
    const preview = document.getElementById('drag-preview');
    if (preview) {
      e.dataTransfer.setDragImage(preview, 80, 50);
    }
  };

  const handlePreviewGenerated = (id: string, preview: string) => {
    setDrawings(prev => prev.map(d => d.id === id ? { ...d, preview } : d));
  };

  const visibleCollections = React.useMemo(() => collections.filter(c => c.id !== 'trash'), [collections]);

  return (
    <Layout
      collections={visibleCollections}
      selectedCollectionId={selectedCollectionId}
      onSelectCollection={setSelectedCollectionId}
      onCreateCollection={handleCreateCollection}
      onEditCollection={handleEditCollection}
      onDeleteCollection={handleDeleteCollection}
      onDrop={handleDrop}
    >
      <div
        id="drag-preview"
        className="fixed top-[-1000px] left-[-1000px] w-[160px] aspect-[16/10] pointer-events-none"
      >
        {dragPreviewDrawings.length > 0 && (
          <div className="relative w-full h-full">
            {dragPreviewDrawings.slice(0, 3).map((d, i) => (
              <div
                key={d.id}
                className="absolute inset-0 bg-slate-50 border-2 border-black rounded-xl shadow-sm flex items-center justify-center overflow-hidden"
                style={{
                  transform: `translate(${i * 4}px, ${i * 4}px)`,
                  zIndex: 3 - i,
                  width: '100%',
                  height: '100%'
                }}
              >
                <div className="absolute inset-0 opacity-[0.3] bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] [background-size:24px_24px]"></div>

                {d.preview ? (
                  <div
                    className="w-full h-full p-2 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:object-contain [&>svg]:drop-shadow-sm relative z-10"
                    dangerouslySetInnerHTML={{ __html: d.preview }}
                  />
                ) : (
                  <div className="text-slate-300 relative z-10"><Folder size={24} /></div>
                )}
              </div>
            ))}
            {dragPreviewDrawings.length > 1 && (
              <div className="absolute -top-2 -right-2 bg-indigo-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-sm z-50">
                {dragPreviewDrawings.length}
              </div>
            )}
          </div>
        )}
      </div>

    {isDragSelecting && selectionBounds && (
        <DragOverlayPortal>
          <div
            className="fixed z-50 pointer-events-none border-2 border-black dark:border-neutral-500 bg-neutral-500/20 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
            style={{
              left: selectionBounds.left,
              top: selectionBounds.top,
              width: selectionBounds.width,
              height: selectionBounds.height,
            }}
          />
        </DragOverlayPortal>
      )}

      <h1 className="text-5xl mb-8 text-slate-900 dark:text-white pl-1" style={{ fontFamily: 'Excalifont' }}>
        {viewTitle}
      </h1>

      <div className="mb-8 flex flex-col xl:flex-row items-center justify-between gap-4">
        <div className="flex flex-1 w-full gap-3 items-center">
          <div className="relative flex-1 group max-w-md transition-all duration-200 focus-within:-translate-y-0.5">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search drawings..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-12 py-2.5 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-xl focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:focus:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] outline-none transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] placeholder:text-slate-400 dark:placeholder:text-neutral-500 text-sm text-slate-900 dark:text-white"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 dark:text-neutral-500 group-focus-within:text-indigo-500 dark:group-focus-within:text-neutral-300 transition-colors pointer-events-none" size={18} />
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 -mt-px pointer-events-none">
              <kbd className="hidden sm:inline-flex items-center h-5 px-1.5 text-[10px] font-bold text-slate-400 dark:text-neutral-600 bg-slate-100 dark:bg-neutral-800 border border-slate-300 dark:border-neutral-700 rounded shadow-[0px_2px_0px_0px_rgba(0,0,0,0.05)]">
                <span className="text-xs mr-0.5">⌘</span>K
              </kbd>
            </div>
          </div>
          <div className="flex items-center gap-2 p-1 overflow-x-auto no-scrollbar">
            <SortButton field="name" label="Name" />
            <SortButton field="createdAt" label="Date Created" />
            <SortButton field="updatedAt" label="Date Modified" />
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <div className="flex items-center gap-2 mr-2">
            <button
              onClick={handleBulkDeleteClick}
              disabled={!hasSelection}
              className={clsx(
                "h-[42px] w-[42px] flex items-center justify-center rounded-xl border-2 transition-all",
                hasSelection
                  ? "bg-white dark:bg-neutral-800 border-black dark:border-neutral-700 text-rose-600 dark:text-rose-400 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 hover:bg-rose-50 dark:hover:bg-rose-900/30"
                  : "bg-slate-100 dark:bg-neutral-900 border-slate-300 dark:border-neutral-800 text-slate-300 dark:text-neutral-700 cursor-not-allowed"
              )}
              title={isTrashView ? "Delete Permanently" : "Move to Trash"}
            >
              <Trash2 size={20} />
            </button>

            <button
              onClick={handleBulkDuplicate}
              disabled={!hasSelection || isTrashView}
              className={clsx(
                "h-[42px] w-[42px] flex items-center justify-center rounded-xl border-2 transition-all",
                hasSelection && !isTrashView
                  ? "bg-white dark:bg-neutral-800 border-black dark:border-neutral-700 text-indigo-600 dark:text-indigo-400 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                  : "bg-slate-100 dark:bg-neutral-900 border-slate-300 dark:border-neutral-800 text-slate-300 dark:text-neutral-700 cursor-not-allowed"
              )}
              title="Duplicate Selected"
            >
              <Copy size={20} />
            </button>

            <div className="relative">
              <button
                onClick={() => hasSelection && setShowBulkMoveMenu(!showBulkMoveMenu)}
                disabled={!hasSelection}
                className={clsx(
                  "h-[42px] w-[42px] flex items-center justify-center rounded-xl border-2 transition-all",
                  hasSelection
                    ? "bg-white dark:bg-neutral-800 border-black dark:border-neutral-700 text-emerald-600 dark:text-emerald-400 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                    : "bg-slate-100 dark:bg-neutral-900 border-slate-300 dark:border-neutral-800 text-slate-300 dark:text-neutral-700 cursor-not-allowed"
                )}
                title="Move Selected"
              >
                <div className="relative">
                  <Folder size={20} />
                  <ArrowRight size={12} className="absolute -bottom-1 -right-1 bg-white dark:bg-slate-800 rounded-full border border-current" strokeWidth={3} />
                </div>
              </button>

              {showBulkMoveMenu && hasSelection && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowBulkMoveMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-neutral-800 rounded-xl border-2 border-black dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] z-50 py-1 max-h-64 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-2 text-[10px] font-bold uppercase text-slate-400 dark:text-neutral-500 tracking-wider border-b border-slate-100 dark:border-neutral-700 mb-1">
                      Move {selectedIds.size} items to...
                    </div>
                    <button
                      onClick={() => handleBulkMove(null)}
                      className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    >
                      <Inbox size={14} /> Unorganized
                    </button>
                    {collections.filter(c => c.name !== 'Trash').map(c => (
                      <button
                        key={c.id}
                        onClick={() => handleBulkMove(c.id)}
                        className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate"
                      >
                        <Folder size={14} /> <span className="truncate">{c.name}</span>
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
            onChange={(e) => {
              handleImportDrawings(e.target.files);
              e.target.value = '';
            }}
          />

          <button
            onClick={() => document.getElementById('dashboard-import')?.click()}
            disabled={isTrashView}
            className={clsx(
              "h-[42px] w-full sm:w-auto flex items-center justify-center gap-2 px-6 rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] transition-all font-bold text-sm whitespace-nowrap",
              isTrashView
                ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 border-slate-300 dark:border-slate-700 shadow-none cursor-not-allowed"
                : "bg-emerald-600 dark:bg-neutral-800 text-white hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:active:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
            )}
          >
            <Upload size={18} strokeWidth={2.5} />
            Import
          </button>

          <button
            onClick={handleCreateDrawing}
            disabled={isTrashView}
            className={clsx(
              "h-[42px] w-full sm:w-auto flex items-center justify-center gap-2 px-6 rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] transition-all font-bold text-sm whitespace-nowrap",
              isTrashView
                ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 border-slate-300 dark:border-slate-700 shadow-none cursor-not-allowed"
                : "bg-indigo-600 dark:bg-neutral-800 text-white hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 active:translate-y-0 active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:active:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
            )}
          >
            <Plus size={18} strokeWidth={2.5} />
            New Drawing
          </button>
        </div>
      </div>

      <div
        className="min-h-full select-none relative"
        onMouseDown={handleMouseDown}
        ref={containerRef}
        onDragOver={(e) => {
          e.preventDefault();
          if (!isDraggingFile && e.dataTransfer.types.includes('Files')) {
            // Fallback if dragEnter didn't fire (e.g. initial drag start outside window)
            setIsDraggingFile(true);
          }
        }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={(e) => {
          setIsDraggingFile(false);
          dragCounter.current = 0;
          const target = selectedCollectionId === undefined ? null : selectedCollectionId;
          handleDrop(e, target);
        }}
      >
        {isDraggingFile && (
          <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm border-4 border-dashed border-indigo-400 rounded-3xl flex flex-col items-center justify-center animate-in fade-in duration-200">
            <div className="bg-indigo-50 p-8 rounded-full mb-6 shadow-sm">
              <Inbox size={64} className="text-indigo-600" />
            </div>
            <h3 className="text-3xl font-bold text-slate-800 mb-2">Drop files to import</h3>
            <p className="text-slate-500 text-lg max-w-md text-center">
              Drop .excalidraw or .json files here to add them to
              <span className="font-bold text-indigo-600 mx-1">
                {viewTitle}
              </span>
            </p>
          </div>
        )}

        {isLoading && drawings.length === 0 ? (
          <div className="flex justify-center items-center h-64 text-indigo-600">
            <Loader2 size={32} className="animate-spin" />
          </div>
        ) : (
          <div className={clsx("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-24 transition-all duration-300", isDraggingFile && "opacity-20 blur-sm")}>
            {sortedDrawings.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-32 text-slate-400 dark:text-neutral-500 border-2 border-dashed border-slate-200 dark:border-neutral-700 rounded-3xl bg-slate-50/50 dark:bg-neutral-800/50">
                <div className="w-20 h-20 bg-white dark:bg-slate-800 rounded-full shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-center mb-6">
                  {isTrashView ? <Trash2 size={32} className="text-slate-300 dark:text-slate-600" /> : <Inbox size={32} className="text-slate-300 dark:text-slate-600" />}
                </div>
                <p className="text-lg font-semibold text-slate-600 dark:text-slate-400">
                  {isTrashView ? "Your trash is empty" : "No drawings found"}
                </p>
                {!isTrashView && (
                  <p className="text-sm mt-2 text-slate-400 dark:text-neutral-500 max-w-xs text-center">
                    {search ? `No results for "${search}"` : "Create a new drawing to get started!"}
                  </p>
                )}
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="mt-4 text-indigo-600 dark:text-indigo-400 font-medium hover:underline text-sm"
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              sortedDrawings.map((drawing) => (
                <DrawingCard
                  key={drawing.id}
                  drawing={drawing}
                  collections={collections}
                  isSelected={selectedIds.has(drawing.id)}
                  onToggleSelection={(e) => handleToggleSelection(drawing.id, e)}
                  onRename={handleRenameDrawing}
                  onDelete={handleDeleteDrawing}
                  onDuplicate={handleDuplicateDrawing}
                  onMoveToCollection={handleMoveToCollection}
                  onClick={(id, e) => {
                    if (selectedIds.size > 0 || e.shiftKey || e.metaKey || e.ctrlKey) {
                      handleToggleSelection(id, e);
                    } else {
                      navigate(`/editor/${id}`);
                    }
                  }}
                  onMouseDown={handleCardMouseDown}
                  onDragStart={handleCardDragStart}
                  onPreviewGenerated={handlePreviewGenerated}
                />
              ))
            )}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!drawingToDelete}
        title="Delete Drawing"
        message="Are you sure you want to permanently delete this drawing? This action cannot be undone."
        confirmText="Delete Permanently"
        onConfirm={() => drawingToDelete && executePermanentDelete(drawingToDelete)}
        onCancel={() => setDrawingToDelete(null)}
      />

      <ConfirmModal
        isOpen={showBulkDeleteConfirm}
        title="Delete Selected Drawings"
        message={`Are you sure you want to permanently delete ${selectedIds.size} drawings? This action cannot be undone.`}
        confirmText={`Delete ${selectedIds.size} Drawings`}
        onConfirm={executeBulkPermanentDelete}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />

      <ConfirmModal
        isOpen={showImportError.isOpen}
        title="Import Failed"
        message={showImportError.message}
        confirmText="OK"
        showCancel={false}
        isDangerous={false}
        onConfirm={() => setShowImportError({ isOpen: false, message: '' })}
        onCancel={() => setShowImportError({ isOpen: false, message: '' })}
      />

    </Layout>
  );
};
