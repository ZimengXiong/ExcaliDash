import React, { useCallback, useEffect, useState, useRef } from "react";
import { Layout } from "../components/Layout";
import { Loader2 } from "lucide-react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useDebounce } from "../hooks/useDebounce";
import { ConfirmModal } from "../components/ConfirmModal";
import { useUpload } from "../context/UploadContext";
import { DragOverlayPortal } from "./dashboard/shared";
import { DashboardToolbar } from "./dashboard/DashboardToolbar";
import {
  DragPreview,
  DrawingsGrid,
  FileDropOverlay,
  ViewerActionToast,
} from "./dashboard/DashboardPanels";
import { useDashboardData } from "./dashboard/useDashboardData";
import { useDashboardCollectionActions } from "./dashboard/useDashboardCollectionActions";
import { useDashboardDrawingActions } from "./dashboard/useDashboardDrawingActions";
import { useDashboardSelection } from "./dashboard/useDashboardSelection";
import { useDashboardSort } from "./dashboard/useDashboardSort";
import { displayFontFamily } from "../utils/displayFont";
const PAGE_SIZE = 24;
export const Dashboard: React.FC = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const selectedCollectionId = React.useMemo(() => {
    if (location.pathname === "/") return undefined;
    if (location.pathname === "/collections") {
      const id = searchParams.get("id");
      if (id === "unorganized") return null;
      return id || undefined;
    }
    return undefined;
  }, [location.pathname, searchParams]);
  const setSelectedCollectionId = (id: string | null | undefined) => {
    if (id === undefined) {
      navigate("/");
    } else if (id === null) {
      navigate("/collections?id=unorganized");
    } else {
      navigate(`/collections?id=${id}`);
    }
  };
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkMoveMenu, setShowBulkMoveMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const loaderRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const {
    sortConfig,
    sortOptions,
    currentSortOption,
    handleSortFieldChange: setSortField,
    handleSortDirectionToggle,
  } = useDashboardSort();
  const { uploadFiles } = useUpload();
  const resetSelection = React.useCallback(() => {
    setSelectedIds(new Set());
  }, []);
  const {
    drawings,
    setDrawings,
    collections,
    setCollections,
    setTotalCount,
    isFetchingMore,
    isLoading,
    hasMore,
    refreshData,
    fetchMore,
  } = useDashboardData({
    debouncedSearch,
    selectedCollectionId,
    sortField: sortConfig.field,
    sortDirection: sortConfig.direction,
    pageSize: PAGE_SIZE,
    onRefreshSuccess: resetSelection,
  });
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          fetchMore();
        }
      },
      { threshold: 0.1 },
    );
    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }
    return () => observer.disconnect();
  }, [fetchMore, hasMore]);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounter = useRef(0);
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) {
      dragCounter.current += 1;
      if (dragCounter.current === 1) {
        setIsDraggingFile(true);
      }
    }
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) {
      dragCounter.current -= 1;
      if (dragCounter.current === 0) {
        setIsDraggingFile(false);
      }
    }
  }, []);
  const sortedDrawings = drawings;
  const selection = useDashboardSelection({
    drawings: sortedDrawings,
    selectedIds,
    setSelectedIds,
    searchInputRef,
  });
  const handleSortFieldChange = (field: typeof sortConfig.field) => {
    setSortField(field);
    setShowSortMenu(false);
  };
  const actions = useDashboardDrawingActions({
    drawings,
    setDrawings,
    collections,
    selectedCollectionId,
    selectedIds,
    setSelectedIds,
    setTotalCount,
    uploadFiles,
    refreshData,
    navigate,
  });
  const collectionActions = useDashboardCollectionActions({
    selectedCollectionId,
    setSelectedCollectionId,
    setCollections,
    refreshData,
  });
  const viewTitle = React.useMemo(() => {
    if (selectedCollectionId === undefined) return "All Drawings";
    if (selectedCollectionId === null) return "Unorganized";
    if (selectedCollectionId === "shared") return "Shared with me";
    if (selectedCollectionId === "trash") return "Trash";
    const collection = collections.find((c) => c.id === selectedCollectionId);
    return collection ? collection.name : "Collection";
  }, [selectedCollectionId, collections]);
  const visibleCollections = React.useMemo(
    () => collections.filter((c) => c.id !== "trash"),
    [collections],
  );
  return (
    <Layout
      collections={visibleCollections}
      selectedCollectionId={selectedCollectionId}
      onSelectCollection={setSelectedCollectionId}
      onCreateCollection={collectionActions.handleCreateCollection}
      onEditCollection={collectionActions.handleEditCollection}
      onDeleteCollection={collectionActions.handleDeleteCollection}
      onDrop={actions.isSharedView ? undefined : actions.handleDrop}
    >
      {" "}
      <DragPreview drawings={actions.dragPreviewDrawings} />{" "}
      {selection.isDragSelecting && selection.selectionBounds && (
        <DragOverlayPortal>
          {" "}
          <div
            className="fixed z-50 pointer-events-none border-2 border-black dark:border-neutral-500 bg-neutral-500/20 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
            style={{
              left: selection.selectionBounds.left,
              top: selection.selectionBounds.top,
              width: selection.selectionBounds.width,
              height: selection.selectionBounds.height,
            }}
          />{" "}
        </DragOverlayPortal>
      )}{" "}
      <h1
        className="text-3xl sm:text-5xl mb-6 sm:mb-8 text-slate-900 dark:text-white pl-1"
        style={{ fontFamily: displayFontFamily }}
      >
        {" "}
        {viewTitle}{" "}
      </h1>{" "}
      <ViewerActionToast message={actions.viewerActionError} />{" "}
      <DashboardToolbar
        search={search}
        searchInputRef={searchInputRef}
        sortConfig={sortConfig}
        sortOptions={sortOptions}
        currentSortOption={currentSortOption}
        showSortMenu={showSortMenu}
        sortedDrawingsCount={sortedDrawings.length}
        allSelected={selection.allSelected}
        hasSelection={selection.hasSelection}
        isTrashView={actions.isTrashView}
        isSharedView={actions.isSharedView}
        isSharedCollection={actions.isSharedCollection}
        currentCollection={actions.currentCollection}
        showBulkMoveMenu={showBulkMoveMenu}
        selectedCount={selectedIds.size}
        collections={collections}
        onSearchChange={setSearch}
        onShowSortMenuChange={setShowSortMenu}
        onSortFieldChange={handleSortFieldChange}
        onSortDirectionToggle={handleSortDirectionToggle}
        onSelectAll={selection.handleSelectAll}
        onBulkDeleteClick={actions.handleBulkDeleteClick}
        onBulkDuplicate={actions.handleBulkDuplicate}
        onShowBulkMoveMenuChange={setShowBulkMoveMenu}
        onBulkMove={actions.handleBulkMove}
        onImportDrawings={actions.handleImportDrawings}
        onCreateDrawing={actions.handleCreateDrawing}
        onViewerActionError={actions.handleViewerActionError}
      />{" "}
      <div
        className="min-h-full select-none relative"
        onMouseDown={selection.handleMouseDown}
        ref={containerRef}
        onDragOver={(e) => {
          e.preventDefault();
          if (!isDraggingFile && e.dataTransfer.types.includes("Files")) {
            setIsDraggingFile(true);
          }
        }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={(e) => {
          setIsDraggingFile(false);
          dragCounter.current = 0;
          const target =
            selectedCollectionId === undefined ? null : selectedCollectionId;
          if (actions.isSharedView) return;
          actions.handleDrop(e, target);
        }}
      >
        {" "}
        {isDraggingFile && <FileDropOverlay viewTitle={viewTitle} />}{" "}
        <DrawingsGrid
          drawings={sortedDrawings}
          collections={collections}
          selectedIds={selectedIds}
          search={search}
          isLoading={isLoading}
          isDraggingFile={isDraggingFile}
          isTrashView={actions.isTrashView}
          isSharedView={actions.isSharedView}
          isSharedCollection={actions.isSharedCollection}
          currentCollection={actions.currentCollection}
          onClearSearch={() => setSearch("")}
          onToggleSelection={selection.handleToggleSelection}
          onRename={actions.handleRenameDrawing}
          onDelete={actions.handleDeleteDrawing}
          onHide={actions.handleHideSharedDrawing}
          onDuplicate={actions.handleDuplicateDrawing}
          onMoveToCollection={actions.handleMoveToCollection}
          onOpenDrawing={(id) => navigate(`/editor/${id}`)}
          onMouseDown={actions.handleCardMouseDown}
          onDragStart={actions.handleCardDragStart}
          onPreviewGenerated={actions.handlePreviewGenerated}
        />{" "}
        <div
          ref={loaderRef}
          className="py-8 flex justify-center items-center h-20"
        >
          {" "}
          {isFetchingMore && (
            <div className="flex items-center gap-2 text-indigo-600 font-bold animate-in fade-in slide-in-from-bottom-2">
              {" "}
              <Loader2 size={24} className="animate-spin" />{" "}
              <span>Loading more...</span>{" "}
            </div>
          )}{" "}
        </div>{" "}
      </div>{" "}
      <ConfirmModal
        isOpen={!!actions.drawingToDelete}
        title="Delete Drawing"
        message="Are you sure you want to permanently delete this drawing? This action cannot be undone."
        confirmText="Delete Permanently"
        onConfirm={() =>
          actions.drawingToDelete &&
          actions.executePermanentDelete(actions.drawingToDelete)
        }
        onCancel={() => actions.setDrawingToDelete(null)}
      />{" "}
      <ConfirmModal
        isOpen={actions.showBulkDeleteConfirm}
        title="Delete Selected Drawings"
        message={`Are you sure you want to permanently delete ${selectedIds.size} drawings? This action cannot be undone.`}
        confirmText={`Delete ${selectedIds.size} Drawings`}
        onConfirm={actions.executeBulkPermanentDelete}
        onCancel={() => actions.setShowBulkDeleteConfirm(false)}
      />{" "}
      <ConfirmModal
        isOpen={actions.showImportError.isOpen}
        title="Import Failed"
        message={actions.showImportError.message}
        confirmText="OK"
        showCancel={false}
        isDangerous={false}
        onConfirm={() =>
          actions.setShowImportError({ isOpen: false, message: "" })
        }
        onCancel={() =>
          actions.setShowImportError({ isOpen: false, message: "" })
        }
      />{" "}
    </Layout>
  );
};
