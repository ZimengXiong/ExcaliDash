import React, { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import * as api from '../api';
import type { Collection } from '../types';
import { Database, FileJson, Upload, Moon, Sun, Info, HardDrive, Lock, Key, ShieldCheck, Unlock } from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { importDrawings } from '../utils/importUtils';
import { useTheme } from '../context/ThemeContext';
import { useVault } from '../context/VaultContext';
import { PrivateVaultSetup } from '../components/PrivateVaultSetup';
import { UnlockVaultModal } from '../components/UnlockVaultModal';
import { ChangeVaultPassword } from '../components/ChangeVaultPassword';

export const Settings: React.FC = () => {
    const [collections, setCollections] = useState<Collection[]>([]);
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();
    const vault = useVault();

    // Import state
    const [importConfirmation, setImportConfirmation] = useState<{ isOpen: boolean; file: File | null }>({ isOpen: false, file: null });
    const [importError, setImportError] = useState<{ isOpen: boolean; message: string }>({ isOpen: false, message: '' });
    const [importSuccess, setImportSuccess] = useState(false);

    // Vault modal state
    const [showVaultSetup, setShowVaultSetup] = useState(false);
    const [showUnlockModal, setShowUnlockModal] = useState(false);
    const [showChangePassword, setShowChangePassword] = useState(false);

    const appVersion = import.meta.env.VITE_APP_VERSION || 'Unknown version';
    const buildLabel = import.meta.env.VITE_APP_BUILD_LABEL;

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

    const handleSelectCollection = (id: string | null | undefined) => {
        // Navigate to dashboard with selected collection
        if (id === undefined) navigate('/');
        else if (id === null) navigate('/collections?id=unorganized');
        else navigate(`/collections?id=${id}`);
    };



    return (
        <Layout
            collections={collections}
            selectedCollectionId="SETTINGS" // Special ID to highlight Settings in Sidebar if we add logic for it
            onSelectCollection={handleSelectCollection}
            onCreateCollection={handleCreateCollection}
            onEditCollection={handleEditCollection}
            onDeleteCollection={handleDeleteCollection}
        >
            <h1 className="text-5xl mb-8 text-slate-900 dark:text-white pl-1" style={{ fontFamily: 'Excalifont' }}>
                Settings
            </h1>

            {/* Private Vault Section */}
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4 pl-1">Private Vault</h2>
                <div className="bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] p-6">
                    {vault.isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                        </div>
                    ) : !vault.isSetup ? (
                        <div className="flex flex-col items-center text-center py-6">
                            <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mb-4">
                                <Lock size={32} className="text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                                Set Up Private Vault
                            </h3>
                            <p className="text-slate-500 dark:text-neutral-400 mb-4 max-w-md">
                                Protect sensitive drawings with end-to-end encryption. 
                                Only you can access them with your password.
                            </p>
                            <button
                                onClick={() => setShowVaultSetup(true)}
                                className="px-6 py-3 bg-indigo-500 border-2 border-black dark:border-indigo-600 rounded-lg font-bold text-white hover:bg-indigo-600 transition-colors shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(79,70,229,0.5)]"
                            >
                                Set Up Vault
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Vault Status */}
                            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-neutral-800 rounded-xl border-2 border-slate-200 dark:border-neutral-700">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                        vault.isUnlocked 
                                            ? 'bg-green-100 dark:bg-green-900/30' 
                                            : 'bg-amber-100 dark:bg-amber-900/30'
                                    }`}>
                                        {vault.isUnlocked ? (
                                            <Unlock size={20} className="text-green-600 dark:text-green-400" />
                                        ) : (
                                            <Lock size={20} className="text-amber-600 dark:text-amber-400" />
                                        )}
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-900 dark:text-white">
                                            {vault.isUnlocked ? 'Vault Unlocked' : 'Vault Locked'}
                                        </p>
                                        <p className="text-sm text-slate-500 dark:text-neutral-400">
                                            {vault.privateDrawingsCount} private drawing{vault.privateDrawingsCount !== 1 ? 's' : ''}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => vault.isUnlocked ? vault.lock() : setShowUnlockModal(true)}
                                    className={`px-4 py-2 border-2 border-black dark:border-neutral-600 rounded-lg font-bold transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] ${
                                        vault.isUnlocked 
                                            ? 'bg-slate-100 dark:bg-neutral-700 text-slate-700 dark:text-neutral-300 hover:bg-slate-200 dark:hover:bg-neutral-600' 
                                            : 'bg-amber-500 text-white hover:bg-amber-600'
                                    }`}
                                >
                                    {vault.isUnlocked ? 'Lock' : 'Unlock'}
                                </button>
                            </div>

                            {/* Vault Actions */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* View Private Drawings */}
                                <button
                                    onClick={() => navigate('/private')}
                                    className="flex items-center gap-3 p-4 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl hover:bg-slate-50 dark:hover:bg-neutral-750 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
                                >
                                    <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
                                        <ShieldCheck size={20} className="text-indigo-600 dark:text-indigo-400" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-bold text-slate-900 dark:text-white">View Private Drawings</p>
                                        <p className="text-sm text-slate-500 dark:text-neutral-400">Access encrypted drawings</p>
                                    </div>
                                </button>

                                {/* Change Password */}
                                <button
                                    onClick={() => setShowChangePassword(true)}
                                    className="flex items-center gap-3 p-4 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl hover:bg-slate-50 dark:hover:bg-neutral-750 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
                                >
                                    <div className="w-10 h-10 bg-slate-100 dark:bg-neutral-700 rounded-lg flex items-center justify-center">
                                        <Key size={20} className="text-slate-600 dark:text-neutral-400" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-bold text-slate-900 dark:text-white">Change Password</p>
                                        <p className="text-sm text-slate-500 dark:text-neutral-400">Update vault password</p>
                                    </div>
                                </button>
                            </div>

                            {/* Password Hint */}
                            {vault.passwordHint && (
                                <div className="p-3 bg-slate-50 dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-lg">
                                    <p className="text-xs text-slate-500 dark:text-neutral-400 mb-1">Password Hint</p>
                                    <p className="text-sm text-slate-700 dark:text-neutral-300">{vault.passwordHint}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4 pl-1">General</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Theme Toggle */}
                <button
                    onClick={toggleTheme}
                    className="flex flex-col items-center justify-center gap-4 p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 transition-all duration-200 group"
                >
                    <div className="w-16 h-16 bg-amber-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-amber-100 dark:border-neutral-700 group-hover:border-amber-200 dark:group-hover:border-neutral-600 transition-colors">
                        {theme === 'light' ? (
                            <Moon size={32} className="text-amber-600 dark:text-amber-400" />
                        ) : (
                            <Sun size={32} className="text-amber-600 dark:text-amber-400" />
                        )}
                    </div>
                    <div className="text-center">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                            {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-neutral-400 font-medium">
                            Switch to {theme === 'light' ? 'dark' : 'light'} theme
                        </p>
                    </div>
                </button>

                {/* Export SQLite (.sqlite) */}
                <button
                    onClick={() => window.location.href = `${api.API_URL}/export`}
                    className="flex flex-col items-center justify-center gap-4 p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 transition-all duration-200 group"
                >
                    <div className="w-16 h-16 bg-indigo-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-indigo-100 dark:border-neutral-700 group-hover:border-indigo-200 dark:group-hover:border-neutral-600 transition-colors">
                        <Database size={32} className="text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div className="text-center">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Export Data (.sqlite)</h3>
                        <p className="text-sm text-slate-500 dark:text-neutral-400 font-medium">Download full database backup</p>
                    </div>
                </button>

                {/* Export SQLite (.db) */}
                <button
                    onClick={() => window.location.href = `${api.API_URL}/export?format=db`}
                    className="flex flex-col items-center justify-center gap-4 p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 transition-all duration-200 group"
                >
                    <div className="w-16 h-16 bg-blue-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-blue-100 dark:border-neutral-700 group-hover:border-blue-200 dark:group-hover:border-neutral-600 transition-colors">
                        <HardDrive size={32} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="text-center">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Export Data (.db)</h3>
                        <p className="text-sm text-slate-500 dark:text-neutral-400 font-medium">Download Prisma .db format</p>
                    </div>
                </button>

                {/* Export JSON */}
                <button
                    onClick={() => window.location.href = `${api.API_URL}/export/json`}
                    className="flex flex-col items-center justify-center gap-4 p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 transition-all duration-200 group"
                >
                    <div className="w-16 h-16 bg-emerald-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-emerald-100 dark:border-neutral-700 group-hover:border-emerald-200 dark:group-hover:border-neutral-600 transition-colors">
                        <FileJson size={32} className="text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="text-center">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Export Data (JSON)</h3>
                        <p className="text-sm text-slate-500 dark:text-neutral-400 font-medium">Download drawings as JSON</p>
                    </div>
                </button>

                {/* Import Data */}
                <div className="relative">
                    <input
                        type="file"
                        multiple
                        accept=".sqlite,.db,.json,.excalidraw"
                        className="hidden"
                        id="settings-import-db"
                        onChange={async (e) => {
                            const files = Array.from(e.target.files || []);
                            if (files.length === 0) return;

                            // Handle Database Import (.sqlite or .db)
                            const databaseFile = files.find(f => f.name.endsWith('.sqlite') || f.name.endsWith('.db'));
                            if (databaseFile) {
                                if (files.length > 1) {
                                    setImportError({ isOpen: true, message: 'Please import database files separately from other files.' });
                                    e.target.value = '';
                                    return;
                                }

                                const formData = new FormData();
                                formData.append('db', databaseFile);

                                try {
                                    const res = await fetch(`${api.API_URL}/import/sqlite/verify`, {
                                        method: 'POST',
                                        body: formData,
                                    });

                                    if (!res.ok) {
                                        const errorData = await res.json();
                                        setImportError({ isOpen: true, message: errorData.error || 'Invalid database file.' });
                                        e.target.value = '';
                                        return;
                                    }

                                    setImportConfirmation({ isOpen: true, file: databaseFile });
                                } catch (err) {
                                    console.error('Verification failed:', err);
                                    setImportError({ isOpen: true, message: 'Failed to verify database file.' });
                                }

                                e.target.value = '';
                                return;
                            }

                            // Handle Bulk Drawing Import
                            const drawingFiles = files.filter(f => f.name.endsWith('.json') || f.name.endsWith('.excalidraw'));
                            if (drawingFiles.length === 0) {
                                setImportError({ isOpen: true, message: 'No supported files found.' });
                                e.target.value = '';
                                return;
                            }

                            const result = await importDrawings(drawingFiles, null, () => { });

                            if (result.failed > 0) {
                                setImportError({
                                    isOpen: true,
                                    message: `Import complete with errors.\nSuccess: ${result.success}\nFailed: ${result.failed}\nErrors:\n${result.errors.join('\n')}`
                                });
                            } else {
                                setImportSuccess(true);
                            }

                            e.target.value = '';
                        }}
                    />
                    <button
                        onClick={() => document.getElementById('settings-import-db')?.click()}
                        className="w-full h-full flex flex-col items-center justify-center gap-4 p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 transition-all duration-200 group"
                    >
                        <div className="w-16 h-16 bg-blue-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-blue-100 dark:border-neutral-700 group-hover:border-blue-200 dark:group-hover:border-neutral-600 transition-colors">
                            <Upload size={32} className="text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="text-center">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Import Data</h3>
                            <p className="text-sm text-slate-500 dark:text-neutral-400 font-medium">Import Database or Drawings</p>
                        </div>

                    </button>
                </div>

                {/* Version Info */}
                <div className="flex flex-col items-center justify-center gap-4 p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]">
                    <div className="w-16 h-16 bg-gray-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-gray-100 dark:border-neutral-700">
                        <Info size={32} className="text-gray-600 dark:text-gray-400" />
                    </div>
                    <div className="text-center">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Version Info</h3>
                        <div className="text-sm text-slate-500 dark:text-neutral-400 font-medium flex flex-col items-center gap-1">
                            <span className="text-base text-slate-900 dark:text-white">
                                {appVersion}
                            </span>
                            {buildLabel && (
                                <span className="text-xs uppercase tracking-wide text-red-500 dark:text-red-400">
                                    {buildLabel}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Modals */}
            <ConfirmModal
                isOpen={importConfirmation.isOpen}
                title="Import Database"
                message="WARNING: This will overwrite your current database with the imported file. This action cannot be undone. Are you sure?"
                confirmText="Import Database"
                onConfirm={async () => {
                    if (!importConfirmation.file) return;

                    const formData = new FormData();
                    formData.append('db', importConfirmation.file);

                    try {
                        const res = await fetch(`${api.API_URL}/import/sqlite`, {
                            method: 'POST',
                            body: formData,
                        });

                        if (!res.ok) {
                            const errorData = await res.json();
                            throw new Error(errorData.error || 'Import failed');
                        }

                        setImportConfirmation({ isOpen: false, file: null });
                        setImportSuccess(true);
                    } catch (err: any) {
                        console.error(err);
                        setImportError({ isOpen: true, message: `Failed to import database: ${err.message}` });
                        setImportConfirmation({ isOpen: false, file: null });
                    }
                }}
                onCancel={() => setImportConfirmation({ isOpen: false, file: null })}
            />

            <ConfirmModal
                isOpen={importError.isOpen}
                title="Import Failed"
                message={importError.message}
                confirmText="OK"
                cancelText=""
                showCancel={false}
                isDangerous={false}
                onConfirm={() => setImportError({ isOpen: false, message: '' })}
                onCancel={() => setImportError({ isOpen: false, message: '' })}
            />

            <ConfirmModal
                isOpen={importSuccess}
                title="Import Successful"
                message="Data imported successfully."
                confirmText="OK"
                showCancel={false}
                isDangerous={false}
                variant="success"
                onConfirm={() => setImportSuccess(false)}
                onCancel={() => setImportSuccess(false)}
            />

            {/* Vault Modals */}
            <PrivateVaultSetup
                isOpen={showVaultSetup}
                onClose={() => setShowVaultSetup(false)}
                onSetup={vault.setupVault}
            />

            <UnlockVaultModal
                isOpen={showUnlockModal}
                onClose={() => setShowUnlockModal(false)}
                onUnlock={vault.unlock}
                passwordHint={vault.passwordHint}
            />

            <ChangeVaultPassword
                isOpen={showChangePassword}
                onClose={() => setShowChangePassword(false)}
                onChangePassword={vault.changePassword}
            />
        </Layout >
    );
};
