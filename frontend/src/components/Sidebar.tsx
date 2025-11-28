import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, Folder, Plus, Trash2, Edit2, Archive, FolderOpen, Settings as SettingsIcon, Lock, Unlock } from 'lucide-react';
import type { Collection } from '../types';
import clsx from 'clsx';
import { ConfirmModal } from './ConfirmModal';
import { Logo } from './Logo';
import { useVault } from '../context/VaultContext';

interface SidebarProps {
  collections: Collection[];
  selectedCollectionId: string | null | undefined;
  onSelectCollection: (id: string | null | undefined) => void;
  onCreateCollection: (name: string) => void;
  onEditCollection: (id: string, name: string) => void;
  onDeleteCollection: (id: string) => void;
  onDrop?: (e: React.DragEvent, collectionId: string | null) => void;
  onDropToVault?: (e: React.DragEvent) => void;
}

interface SidebarItemProps {
  id: string | null; // null for Unorganized
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  extraAction?: React.ReactNode;
  isEditing?: boolean;
  editValue?: string;
  onEditChange?: (val: string) => void;
  onEditSubmit?: (e: React.FormEvent) => void;
  onEditBlur?: () => void;
  onDrop?: (e: React.DragEvent, collectionId: string | null) => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({
  id,
  icon,
  label,
  isActive,
  onClick,
  onDoubleClick,
  onContextMenu,
  extraAction,
  isEditing,
  editValue,
  onEditChange,
  onEditSubmit,
  onEditBlur,
  onDrop
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div className="relative group/item pl-3 pr-2">
      {isEditing ? (
        <form onSubmit={onEditSubmit} className="py-1">
          <input
            autoFocus
            type="text"
            value={editValue}
            onChange={(e) => onEditChange?.(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] outline-none font-bold text-slate-900 dark:text-white"
            onBlur={onEditBlur}
          />
        </form>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={onClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onClick();
            }
          }}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContextMenu}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            onDrop?.(e, id);
          }}
          className={clsx(
            "w-full flex items-center gap-3 px-3 py-2.5 text-sm font-bold rounded-lg transition-all duration-200 border-2 group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-2 dark:focus-visible:ring-neutral-500",
            isActive || isDragOver
              ? "bg-indigo-50 dark:bg-neutral-800 text-indigo-900 dark:text-neutral-200 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] -translate-y-0.5"
              : "text-slate-600 dark:text-neutral-400 border-transparent hover:bg-slate-50 dark:hover:bg-neutral-800 hover:border-black dark:hover:border-neutral-700 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5"
          )}
        >
          <span className={clsx("transition-colors duration-200", isActive || isDragOver ? "text-indigo-900 dark:text-neutral-200" : "text-slate-400 dark:text-neutral-500 group-hover:text-slate-900 dark:group-hover:text-neutral-200")}>
            {icon}
          </span>
          <span className="min-w-0 flex-1 text-left font-bold">{label}</span>
          {extraAction && (
            <div className="opacity-0 group-hover/item:opacity-100 transition-all duration-200 flex items-center gap-1 flex-shrink-0">
              {extraAction}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Private Folder Item Component
const PrivateFolderItem: React.FC<{
  isActive: boolean;
  onSelectCollection: (id: string | null | undefined) => void;
  onDropToVault?: (e: React.DragEvent) => void;
}> = ({ isActive, onSelectCollection, onDropToVault }) => {
  const vault = useVault();
  const navigate = useNavigate();
  const [isDragOver, setIsDragOver] = useState(false);

  // Don't show if still loading
  if (vault.isLoading) {
    return null;
  }

  const handleClick = () => {
    // Always navigate to /private - that page handles setup/unlock flow
    onSelectCollection('private');
    navigate('/private');
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Show drag over state for any drag (the actual check happens on drop)
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    onDropToVault?.(e);
  };

  // Show different badge based on vault state
  const getBadge = () => {
    if (isDragOver) {
      return (
        <span className="text-xs bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 px-1.5 py-0.5 rounded-md font-bold animate-pulse">
          Drop
        </span>
      );
    }
    if (!vault.isSetup) {
      return (
        <span className="text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-md font-bold">
          Setup
        </span>
      );
    }
    if (vault.privateDrawingsCount > 0) {
      return (
        <span className="text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-md font-bold">
          {vault.privateDrawingsCount}
        </span>
      );
    }
    return null;
  };

  return (
    <div className="pl-3 pr-2">
      <button
        onClick={handleClick}
        onDragOver={vault.isSetup ? handleDragOver : undefined}
        onDragLeave={vault.isSetup ? handleDragLeave : undefined}
        onDrop={vault.isSetup ? handleDrop : undefined}
        className={clsx(
          "w-full flex items-center gap-3 px-3 py-2.5 text-sm font-bold rounded-lg transition-all duration-200 border-2",
          isActive || isDragOver
            ? "bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-300 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] -translate-y-0.5"
            : "text-slate-600 dark:text-neutral-400 border-transparent hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-900 dark:hover:text-amber-300 hover:border-black dark:hover:border-neutral-700 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5"
        )}
      >
        {vault.isSetup && vault.isUnlocked ? (
          <Unlock size={18} className={clsx(isActive || isDragOver ? "text-amber-900 dark:text-amber-300" : "text-amber-500 dark:text-amber-400")} />
        ) : (
          <Lock size={18} className={clsx(isActive || isDragOver ? "text-amber-900 dark:text-amber-300" : "text-amber-500 dark:text-amber-400")} />
        )}
        <span className="min-w-0 flex-1 text-left">Private</span>
        {getBadge()}
      </button>
    </div>
  );
};


export const Sidebar: React.FC<SidebarProps> = ({
  collections,
  selectedCollectionId,
  onSelectCollection,
  onCreateCollection,
  onEditCollection,
  onDeleteCollection,
  onDrop,
  onDropToVault
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: 'item' | 'background'; id?: string } | null>(null);
  const [collectionToDelete, setCollectionToDelete] = useState<string | null>(null);
  const [isTrashDragOver, setIsTrashDragOver] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);


  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newCollectionName.trim()) {
      onCreateCollection(newCollectionName);
      setNewCollectionName('');
      setIsCreating(false);
    }
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId && editName.trim()) {
      onEditCollection(editingId, editName);
      setEditingId(null);
    }
  };

  const handleItemContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'item', id });
  };

  const handleBackgroundContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'background' });
  };

  return (
    <>
      <div className="w-full flex flex-col h-full bg-transparent">
        <div className="p-5 pb-2">
          <h1 className="text-2xl text-slate-900 dark:text-white flex items-center gap-3 tracking-tight" style={{ fontFamily: 'Excalifont' }}>
            <Logo className="w-10 h-10" />
            <span className="mt-1">ExcaliDash</span>
            <span className="text-xs font-bold text-red-500 mt-2" style={{ fontFamily: 'sans-serif' }}>BETA</span>
          </h1>
        </div>

        <nav
          className="flex-1 overflow-y-auto py-4 space-y-8 custom-scrollbar"
          onContextMenu={handleBackgroundContextMenu}
        >
          <div className="space-y-1">
            <div className="px-6 pb-2 text-[11px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-wider">
              Library
            </div>
            <div className="pl-3 pr-2">
              <button
                onClick={() => onSelectCollection(undefined)}
                className={clsx(
                  "w-full flex items-center gap-3 px-3 py-2.5 text-sm font-bold rounded-lg transition-all duration-200 border-2",
                  selectedCollectionId === undefined
                    ? "bg-indigo-50 dark:bg-neutral-800 text-indigo-900 dark:text-neutral-200 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] -translate-y-0.5"
                    : "text-slate-600 dark:text-neutral-400 border-transparent hover:bg-slate-50 dark:hover:bg-neutral-800 hover:border-black dark:hover:border-neutral-700 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5"
                )}
              >
                <LayoutGrid size={18} className={clsx(selectedCollectionId === undefined ? "text-indigo-900 dark:text-neutral-200" : "text-slate-400 dark:text-neutral-500")} />
                <span className="min-w-0 flex-1 text-left">All Drawings</span>
              </button>
            </div>

            <SidebarItem
              id={null}
              icon={<Archive size={18} />}
              label="Unorganized"
              isActive={selectedCollectionId === null}
              onClick={() => onSelectCollection(null)}
              onDrop={onDrop}
            />

            <PrivateFolderItem 
              isActive={selectedCollectionId === 'private'} 
              onSelectCollection={onSelectCollection}
              onDropToVault={onDropToVault}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between px-6 pb-2 group/header">
              <span className="text-[11px] font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-wider">Collections</span>
              <button
                onClick={(e) => { e.stopPropagation(); setIsCreating(true); }}
                className="p-1 text-slate-400 dark:text-neutral-500 hover:text-indigo-600 dark:hover:text-neutral-200 hover:bg-indigo-50 dark:hover:bg-neutral-800 rounded-md transition-all opacity-0 group-hover/header:opacity-100"
                title="New Collection"
              >
                <Plus size={14} strokeWidth={2.5} />
              </button>
            </div>

            {isCreating && (
              <form onSubmit={handleCreateSubmit} className="mb-2 px-4" onClick={e => e.stopPropagation()}>
                <input
                  autoFocus
                  type="text"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  placeholder="New Collection..."
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] outline-none placeholder:text-slate-400 dark:placeholder:text-neutral-500 font-bold text-slate-900 dark:text-white"
                  onBlur={() => !newCollectionName && setIsCreating(false)}
                />
              </form>
            )}

            {collections.filter(c => c.name !== 'Trash').map((collection) => (
              <SidebarItem
                key={collection.id}
                id={collection.id}
                icon={selectedCollectionId === collection.id ? <FolderOpen size={18} /> : <Folder size={18} />}
                label={collection.name}
                isActive={selectedCollectionId === collection.id}
                onClick={() => onSelectCollection(collection.id)}
                onDoubleClick={() => {
                  setEditingId(collection.id);
                  setEditName(collection.name);
                }}
                onContextMenu={(e) => handleItemContextMenu(e, collection.id)}
                isEditing={editingId === collection.id}
                editValue={editName}
                onEditChange={setEditName}
                onEditSubmit={handleEditSubmit}
                onEditBlur={() => setEditingId(null)}
                onDrop={onDrop}
              />
            ))}
          </div>
        </nav>

        <div className="px-3 pt-4 pb-4 border-t border-slate-200/50 dark:border-slate-700/50 space-y-2">
          <button
            onDragOver={(e) => {
              e.preventDefault();
              setIsTrashDragOver(true);
            }}
            onDragLeave={() => setIsTrashDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsTrashDragOver(false);
              onDrop?.(e, 'trash');
            }}
            onClick={() => {
              navigate('/collections?id=trash');
            }}
            className={clsx(
              "w-full flex items-center gap-3 px-3 py-2 text-sm font-bold rounded-xl transition-all duration-200 border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]",
              selectedCollectionId === 'trash' || isTrashDragOver
                ? "bg-rose-50 dark:bg-rose-900/30 text-rose-900 dark:text-rose-300 -translate-y-0.5"
                : "bg-white dark:bg-neutral-900 text-slate-900 dark:text-neutral-200 hover:bg-rose-50 dark:hover:bg-rose-900/30 hover:text-rose-900 dark:hover:text-rose-300 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5"
            )}
          >
            <Trash2 size={18} />
            <span className="min-w-0 flex-1 text-left">Trash</span>
          </button>

          <button
            onClick={() => navigate('/settings')}
            className={clsx(
              "w-full flex items-center gap-3 px-3 py-2 text-sm font-bold rounded-xl transition-all duration-200 border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]",
              selectedCollectionId === 'SETTINGS'
                ? "bg-indigo-50 dark:bg-neutral-800 text-indigo-900 dark:text-neutral-200 -translate-y-0.5"
                : "bg-white dark:bg-neutral-900 text-slate-900 dark:text-neutral-200 hover:bg-slate-50 dark:hover:bg-neutral-800 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5"
            )}
          >
            <SettingsIcon size={18} />
            <span className="min-w-0 flex-1 text-left">Settings</span>
          </button>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
        >
          <div
            className="absolute bg-white dark:bg-neutral-800 rounded-lg border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.type === 'item' && contextMenu.id ? (
              <>
                <button
                  onClick={() => {
                    const collection = collections.find(c => c.id === contextMenu.id);
                    if (collection) {
                      setEditingId(collection.id);
                      setEditName(collection.name);
                    }
                    setContextMenu(null);
                  }}
                  className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-2"
                >
                  <Edit2 size={14} /> Rename Collection
                </button>

                <button
                  onClick={() => {
                    setCollectionToDelete(contextMenu.id!);
                    setContextMenu(null);
                  }}
                  className="w-full px-3 py-2 text-sm text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 flex items-center gap-2"
                >
                  <Trash2 size={14} /> Delete Collection
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setIsCreating(true);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-2"
              >
                <Plus size={14} /> New Collection
              </button>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!collectionToDelete}
        title="Delete Collection"
        message="Are you sure you want to delete this collection? All drawings inside will be moved to Unorganized."
        confirmText="Delete Collection"
        onConfirm={() => {
          if (collectionToDelete) {
            onDeleteCollection(collectionToDelete);
            setCollectionToDelete(null);
          }
        }}
        onCancel={() => setCollectionToDelete(null)}
      />


    </>
  );
};

