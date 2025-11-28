import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Layout } from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import * as api from '../api';
import type { Drawing, Collection } from '../types';
import { Lock, Unlock, Loader2, Inbox, AlertCircle, MoreVertical, Trash2, UnlockKeyhole, PenTool, Clock, ShieldCheck } from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { UnlockVaultModal } from '../components/UnlockVaultModal';
import { PrivateVaultSetup } from '../components/PrivateVaultSetup';
import { useVault } from '../context/VaultContext';
import { decryptDrawing } from '../utils/crypto';
import { formatDistanceToNow } from 'date-fns';

const ContextMenuPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return createPortal(children, document.body);
};

// Simple private drawing card component
const PrivateDrawingCard: React.FC<{
    drawing: Drawing;
    onClick: () => void;
    onDelete: () => void;
    onRemoveFromVault: () => void;
    onRename: (id: string, name: string) => void;
}> = ({ drawing, onClick, onDelete, onRemoveFromVault, onRename }) => {
    const [showMenu, setShowMenu] = useState(false);
    const [isRenaming, setIsRenaming] = useState(false);
    const [newName, setNewName] = useState(drawing.name);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

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
        setShowMenu(false);
    };

    return (
        <>
            <div 
                className="group relative bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl overflow-hidden shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 transition-all duration-200 cursor-pointer"
                onClick={onClick}
                onContextMenu={handleContextMenu}
            >
                {/* Preview - Dark/black background for private drawings (no preview shown for privacy) */}
                <div className="aspect-[4/3] bg-neutral-900 dark:bg-black flex items-center justify-center relative">
                    {/* Lock indicator badge */}
                    <div className="absolute top-2 left-2 w-8 h-8 bg-amber-100 dark:bg-amber-900/50 rounded-lg flex items-center justify-center border border-amber-200 dark:border-amber-800">
                        <Lock size={14} className="text-amber-600 dark:text-amber-400" />
                    </div>

                    {/* Menu button */}
                    <button
                        className="absolute top-2 right-2 w-8 h-8 bg-white dark:bg-neutral-800 rounded-lg flex items-center justify-center border border-slate-200 dark:border-neutral-700 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowMenu(!showMenu);
                        }}
                    >
                        <MoreVertical size={14} className="text-slate-600 dark:text-neutral-400" />
                    </button>

                    {/* Dropdown menu */}
                    {showMenu && (
                        <div 
                            className="absolute top-12 right-2 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] py-1 min-w-[160px] z-10"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 flex items-center gap-2"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowMenu(false);
                                    setIsRenaming(true);
                                }}
                            >
                                <PenTool size={14} />
                                Rename
                            </button>
                            <button
                                className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 flex items-center gap-2"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowMenu(false);
                                    onRemoveFromVault();
                                }}
                            >
                                <UnlockKeyhole size={14} />
                                Remove from Vault
                            </button>
                            <button
                                className="w-full px-3 py-2 text-sm text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowMenu(false);
                                    onDelete();
                                }}
                            >
                                <Trash2 size={14} />
                                Delete Permanently
                            </button>
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="p-4 border-t-2 border-black dark:border-neutral-700">
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
                            className="font-bold text-slate-900 dark:text-white truncate mb-1 cursor-text select-none"
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                setIsRenaming(true);
                            }}
                        >
                            {drawing.name}
                        </h3>
                    )}
                    <p className="text-xs text-slate-500 dark:text-neutral-400 flex items-center gap-1.5">
                        <Clock size={11} />
                        {formatDistanceToNow(drawing.updatedAt, { addSuffix: true })}
                    </p>
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

                            <button
                                onClick={() => {
                                    onRemoveFromVault();
                                    setContextMenu(null);
                                }}
                                className="w-full px-3 py-2 text-sm text-left text-slate-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white flex items-center gap-2"
                            >
                                <UnlockKeyhole size={14} /> Remove from Vault
                            </button>

                            <div className="border-t border-slate-50 dark:border-slate-700 my-1"></div>

                            <button
                                onClick={() => {
                                    onDelete();
                                    setContextMenu(null);
                                }}
                                className="w-full px-3 py-2 text-sm text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 flex items-center gap-2"
                            >
                                <Trash2 size={14} /> Delete Permanently
                            </button>
                        </div>
                    </div>
                </ContextMenuPortal>
            )}
        </>
    );
};

export const PrivateDrawings: React.FC = () => {
    const navigate = useNavigate();
    const vault = useVault();
    const [drawings, setDrawings] = useState<Drawing[]>([]);
    const [collections, setCollections] = useState<Collection[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showUnlockModal, setShowUnlockModal] = useState(false);
    const [showSetupModal, setShowSetupModal] = useState(false);
    const [modalDismissed, setModalDismissed] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [drawingToUnlock, setDrawingToUnlock] = useState<string | null>(null);

    // Fetch collections for sidebar
    useEffect(() => {
        const fetchCollections = async () => {
            try {
                const data = await api.getCollections();
                setCollections(data);
            } catch (err) {
                console.error('Failed to fetch collections:', err);
            }
        };
        fetchCollections();
    }, []);

    // Fetch private drawings when vault is unlocked
    const fetchPrivateDrawings = useCallback(async () => {
        if (!vault.isUnlocked || !vault.sessionKey) return;

        setIsLoading(true);
        setError(null);

        try {
            const privateDrawings = await api.getPrivateDrawings();
            
            // Decrypt names for display (the actual content is decrypted when opening)
            const decryptedDrawings = await Promise.all(
                privateDrawings.map(async (drawing) => {
                    // For now, just use the stored name (names aren't encrypted yet)
                    // In a full implementation, you'd decrypt the name here
                    return drawing;
                })
            );

            setDrawings(decryptedDrawings);
        } catch (err) {
            console.error('Failed to fetch private drawings:', err);
            setError('Failed to load private drawings');
        } finally {
            setIsLoading(false);
        }
    }, [vault.isUnlocked, vault.sessionKey]);

    // Handle vault state changes
    useEffect(() => {
        if (vault.isUnlocked) {
            fetchPrivateDrawings();
            setShowUnlockModal(false);
            setModalDismissed(false); // Reset dismissed state when unlocked
        } else if (!vault.isLoading && vault.isSetup && !modalDismissed) {
            // Vault is setup but locked - auto-show unlock modal on first visit only
            setShowUnlockModal(true);
        }
    }, [vault.isUnlocked, vault.isLoading, vault.isSetup, fetchPrivateDrawings, modalDismissed]);

    // Handle unlock modal close
    const handleUnlockModalClose = useCallback(() => {
        setShowUnlockModal(false);
        setModalDismissed(true); // Prevent auto-reopening
    }, []);

    const handleSelectCollection = (id: string | null | undefined) => {
        if (id === undefined) navigate('/');
        else if (id === null) navigate('/collections?id=unorganized');
        else if (id === 'private') navigate('/private');
        else navigate(`/collections?id=${id}`);
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
        await api.deleteCollection(id);
    };

    const handleOpenDrawing = (id: string) => {
        navigate(`/editor/${id}`);
    };

    const handleRemoveFromVault = async (id: string) => {
        if (!vault.sessionKey) return;

        const drawing = drawings.find(d => d.id === id);
        if (!drawing || !drawing.encryptedData || !drawing.iv) return;

        try {
            // Decrypt the drawing data
            const decrypted = await decryptDrawing(
                drawing.encryptedData,
                drawing.iv,
                vault.sessionKey
            );

            // Unlock the drawing (move it out of private vault)
            await api.unlockDrawing(
                id,
                decrypted.elements,
                decrypted.appState,
                decrypted.files
            );

            // Refresh the list
            fetchPrivateDrawings();
        } catch (err) {
            console.error('Failed to remove drawing from vault:', err);
            setError('Failed to remove drawing from vault');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await api.deleteDrawing(id);
            setDrawings(prev => prev.filter(d => d.id !== id));
        } catch (err) {
            console.error('Failed to delete drawing:', err);
        }
    };

    const handleRename = async (id: string, name: string) => {
        try {
            await api.updateDrawing(id, { name });
            setDrawings(prev => prev.map(d => d.id === id ? { ...d, name } : d));
        } catch (err) {
            console.error('Failed to rename drawing:', err);
        }
    };

    if (vault.isLoading) {
        return (
            <Layout
                collections={collections}
                selectedCollectionId="private"
                onSelectCollection={handleSelectCollection}
                onCreateCollection={handleCreateCollection}
                onEditCollection={handleEditCollection}
                onDeleteCollection={handleDeleteCollection}
            >
                <div className="flex items-center justify-center h-64">
                    <Loader2 size={32} className="animate-spin text-indigo-600" />
                </div>
            </Layout>
        );
    }

    return (
        <Layout
            collections={collections}
            selectedCollectionId="private"
            onSelectCollection={handleSelectCollection}
            onCreateCollection={handleCreateCollection}
            onEditCollection={handleEditCollection}
            onDeleteCollection={handleDeleteCollection}
        >
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center border-2 border-amber-200 dark:border-amber-800">
                        {vault.isUnlocked ? (
                            <Unlock size={24} className="text-amber-600 dark:text-amber-400" />
                        ) : (
                            <Lock size={24} className="text-amber-600 dark:text-amber-400" />
                        )}
                    </div>
                    <div>
                        <h1 className="text-4xl text-slate-900 dark:text-white" style={{ fontFamily: 'Excalifont' }}>
                            Private Vault
                        </h1>
                        <p className="text-slate-500 dark:text-neutral-400 text-sm">
                            {!vault.isSetup 
                                ? 'Set up your private vault to protect sensitive drawings'
                                : vault.isUnlocked 
                                    ? 'End-to-end encrypted drawings' 
                                    : 'Unlock vault to view drawings'}
                        </p>
                    </div>
                </div>

                {vault.isUnlocked && (
                    <button
                        onClick={() => vault.lock()}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-lg font-bold text-slate-700 dark:text-neutral-300 hover:bg-slate-200 dark:hover:bg-neutral-700 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
                    >
                        <Lock size={16} />
                        Lock Vault
                    </button>
                )}
            </div>

            {error && (
                <div className="flex items-center gap-2 p-4 mb-6 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl">
                    <AlertCircle size={20} className="text-red-600 dark:text-red-400" />
                    <span className="text-red-700 dark:text-red-300">{error}</span>
                </div>
            )}

            {/* Not Set Up State */}
            {!vault.isSetup ? (
                <div className="flex flex-col items-center justify-center py-16">
                    <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mb-6 border-2 border-indigo-200 dark:border-indigo-800">
                        <ShieldCheck size={40} className="text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                        Set Up Private Vault
                    </h2>
                    <p className="text-slate-500 dark:text-neutral-400 mb-6 text-center max-w-md">
                        Protect sensitive drawings with end-to-end encryption. 
                        Only you can access them with your password.
                    </p>
                    <button
                        onClick={() => setShowSetupModal(true)}
                        className="px-6 py-3 bg-indigo-500 border-2 border-black dark:border-indigo-600 rounded-lg font-bold text-white hover:bg-indigo-600 transition-colors shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(79,70,229,0.5)]"
                    >
                        Set Up Vault
                    </button>
                </div>
            ) : !vault.isUnlocked ? (
                /* Locked State */
                <div className="flex flex-col items-center justify-center py-16">
                    <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center mb-6 border-2 border-amber-200 dark:border-amber-800">
                        <Lock size={40} className="text-amber-600 dark:text-amber-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                        Vault is Locked
                    </h2>
                    <p className="text-slate-500 dark:text-neutral-400 mb-6 text-center max-w-md">
                        Enter your password to access your private drawings.
                    </p>
                    <button
                        onClick={() => {
                            setModalDismissed(false);
                            setShowUnlockModal(true);
                        }}
                        className="px-6 py-3 bg-amber-500 border-2 border-black dark:border-amber-600 rounded-lg font-bold text-white hover:bg-amber-600 transition-colors shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(245,158,11,0.5)]"
                    >
                        Unlock Vault
                    </button>
                </div>
            ) : isLoading ? (
                /* Loading State */
                <div className="flex items-center justify-center h-64">
                    <Loader2 size={32} className="animate-spin text-indigo-600" />
                </div>
            ) : drawings.length === 0 ? (
                /* Empty State */
                <div className="flex flex-col items-center justify-center py-16">
                    <div className="w-20 h-20 bg-slate-100 dark:bg-neutral-800 rounded-2xl flex items-center justify-center mb-6 border-2 border-slate-200 dark:border-neutral-700">
                        <Inbox size={40} className="text-slate-400 dark:text-neutral-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                        No Private Drawings
                    </h2>
                    <p className="text-slate-500 dark:text-neutral-400 text-center max-w-md">
                        Move drawings to your private vault from the dashboard context menu.
                    </p>
                </div>
            ) : (
                /* Drawings Grid */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {drawings.map((drawing) => (
                        <PrivateDrawingCard
                            key={drawing.id}
                            drawing={drawing}
                            onClick={() => handleOpenDrawing(drawing.id)}
                            onDelete={() => handleDelete(drawing.id)}
                            onRemoveFromVault={() => setDrawingToUnlock(drawing.id)}
                            onRename={handleRename}
                        />
                    ))}
                </div>
            )}

            {/* Setup Modal */}
            <PrivateVaultSetup
                isOpen={showSetupModal}
                onClose={() => setShowSetupModal(false)}
                onSetup={vault.setupVault}
            />

            {/* Unlock Modal */}
            <UnlockVaultModal
                isOpen={showUnlockModal}
                onClose={handleUnlockModalClose}
                onUnlock={vault.unlock}
                passwordHint={vault.passwordHint}
            />

            {/* Confirm remove from vault */}
            <ConfirmModal
                isOpen={!!drawingToUnlock}
                title="Remove from Private Vault"
                message="This will decrypt the drawing and move it back to your regular drawings. Are you sure?"
                confirmText="Remove from Vault"
                onConfirm={() => {
                    if (drawingToUnlock) {
                        handleRemoveFromVault(drawingToUnlock);
                    }
                    setDrawingToUnlock(null);
                }}
                onCancel={() => setDrawingToUnlock(null)}
            />
        </Layout>
    );
};
