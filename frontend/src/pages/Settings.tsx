import React, { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import * as api from '../api';
import type { Collection } from '../types';
import { Database, FileJson, Upload, Moon, Sun, Info, HardDrive } from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { importDrawings } from '../utils/importUtils';
import { useTheme } from '../context/ThemeContext';

export const Settings: React.FC = () => {
    const [collections, setCollections] = useState<Collection[]>([]);
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();

    const [importConfirmation, setImportConfirmation] = useState<{ isOpen: boolean; file: File | null }>({ isOpen: false, file: null });
    const [importError, setImportError] = useState<{ isOpen: boolean; message: string }>({ isOpen: false, message: '' });
    const [importSuccess, setImportSuccess] = useState(false);

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
        if (id === undefined) navigate('/');
        else if (id === null) navigate('/collections?id=unorganized');
        else navigate(`/collections?id=${id}`);
    };



    return (
        <Layout
            collections={collections}
            selectedCollectionId="SETTINGS"
            onSelectCollection={handleSelectCollection}
            onCreateCollection={handleCreateCollection}
            onEditCollection={handleEditCollection}
            onDeleteCollection={handleDeleteCollection}
        >
            <h1 className="text-5xl mb-8 text-slate-900 dark:text-white pl-1" style={{ fontFamily: 'Excalifont' }}>
                Settings
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
        </Layout >
    );
};
