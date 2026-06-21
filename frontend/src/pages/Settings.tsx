import React, { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import * as api from '../api';
import type { Collection } from '../types';
import { Upload, Moon, Sun, Info, Archive, RefreshCw, Check, Zap, ZapOff } from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { importLegacyFiles } from '../utils/importUtils';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import clsx from 'clsx';

export const Settings: React.FC = () => {
    const [collections, setCollections] = useState<Collection[]>([]);
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();
    const { authEnabled, user, authMode } = useAuth();

    const [legacyDbImportConfirmation, setLegacyDbImportConfirmation] = useState<{
        isOpen: boolean;
        file: File | null;
        info: null | {
            drawings: number;
            collections: number;
            legacyLatestMigration: string | null;
            currentLatestMigration: string | null;
        };
    }>({ isOpen: false, file: null, info: null });
    const [importError, setImportError] = useState<{ isOpen: boolean; message: string }>({ isOpen: false, message: '' });
    const [importSuccess, setImportSuccess] = useState<{ isOpen: boolean; message: React.ReactNode }>({ isOpen: false, message: '' });
    const [legacyDbImportLoading, setLegacyDbImportLoading] = useState(false);
    const [authToggleLoading, setAuthToggleLoading] = useState(false);
    const [authToggleError, setAuthToggleError] = useState<string | null>(null);
    const [authToggleConfirm, setAuthToggleConfirm] = useState<{ isOpen: boolean; nextEnabled: boolean | null }>({
        isOpen: false,
        nextEnabled: null,
    });
    const [authDisableFinalConfirmOpen, setAuthDisableFinalConfirmOpen] = useState(false);

    const [backupExportExt, setBackupExportExt] = useState<'excalidash' | 'excalidash.zip'>('excalidash');
    const [backupImportConfirmation, setBackupImportConfirmation] = useState<{
        isOpen: boolean;
        file: File | null;
        info: null | {
            formatVersion: number;
            exportedAt: string;
            excalidashBackendVersion: string | null;
            collections: number;
            drawings: number;
        };
    }>({ isOpen: false, file: null, info: null });
    const [backupImportLoading, setBackupImportLoading] = useState(false);
    const [backupImportSuccess, setBackupImportSuccess] = useState(false);
    const [backupImportError, setBackupImportError] = useState<{ isOpen: boolean; message: string }>({ isOpen: false, message: '' });

    const appVersion = import.meta.env.VITE_APP_VERSION || 'Unknown version';
    const buildLabel = import.meta.env.VITE_APP_BUILD_LABEL;
    const isManagedAuthMode = authMode !== 'local';

    const UPDATE_CHANNEL_KEY = 'excalidash-update-channel';
    const UPDATE_INFO_KEY = 'excalidash-update-info';
    const [updateChannel, setUpdateChannel] = useState<api.UpdateChannel>(() => {
        const raw = typeof window === 'undefined' ? null : window.localStorage?.getItem?.(UPDATE_CHANNEL_KEY) ?? null;
        return raw === 'prerelease' ? 'prerelease' : 'stable';
    });
    const [updateInfo, setUpdateInfo] = useState<api.UpdateInfo | null>(null);
    const [updateLoading, setUpdateLoading] = useState(false);
    const [updateError, setUpdateError] = useState<string | null>(null);

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

    const COMPRESSION_ENABLED_KEY = 'excalidash-image-compression';
    const [imageCompression, setImageCompression] = useState<boolean>(() => {
        const raw = typeof window === 'undefined' ? null : window.localStorage?.getItem?.(COMPRESSION_ENABLED_KEY);
        return raw !== 'false';
    });

    const toggleImageCompression = () => {
        const next = !imageCompression;
        try {
            window.localStorage?.setItem?.(COMPRESSION_ENABLED_KEY, String(next));
        } catch { }
        setImageCompression(next);
    };

    const checkForUpdates = async (channel: api.UpdateChannel) => {
        setUpdateLoading(true);
        setUpdateError(null);
        try {
            const info = await api.getUpdateInfo(channel);
            setUpdateInfo(info);
            try {
                window.localStorage?.setItem?.(`${UPDATE_INFO_KEY}:${channel}`, JSON.stringify(info));
            } catch {
            }
        } catch (err: unknown) {
            let message = 'Failed to check for updates';
            if (api.isAxiosError(err)) {
                message =
                    err.response?.data?.message ||
                    err.response?.data?.error ||
                    message;
            }
            setUpdateError(message);
        } finally {
            setUpdateLoading(false);
        }
    };

    useEffect(() => {
        void checkForUpdates(updateChannel);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const setAuthEnabled = async (enabled: boolean) => {
        setAuthToggleLoading(true);
        setAuthToggleError(null);
        try {
            const response = await api.api.post<{ authEnabled: boolean; bootstrapRequired?: boolean }>(
                '/auth/auth-enabled',
                { enabled },
            );

            if (response.data.authEnabled) {
                window.location.href = response.data.bootstrapRequired ? '/register' : '/login';
                return;
            }

            window.location.reload();
        } catch (err: unknown) {
            let message = 'Failed to update authentication setting';
            if (api.isAxiosError(err)) {
                message =
                    err.response?.data?.message ||
                    err.response?.data?.error ||
                    message;
            }
            setAuthToggleError(message);
        } finally {
            setAuthToggleLoading(false);
        }
    };

    const confirmToggleAuthEnabled = () => {
        if (authEnabled === null) return;
        if (authToggleLoading) return;
        setAuthToggleConfirm({ isOpen: true, nextEnabled: !authEnabled });
    };

    const exportBackup = async () => {
        try {
            const extQuery = backupExportExt === 'excalidash.zip' ? '?ext=zip' : '';
            const response = await api.api.get(`/export/excalidash${extQuery}`, { responseType: 'blob' });
            const blob = new Blob([response.data], { type: 'application/zip' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const date = new Date().toISOString().split('T')[0];
            link.download = backupExportExt === 'excalidash.zip'
                ? `excalidash-backup-${date}.excalidash.zip`
                : `excalidash-backup-${date}.excalidash`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err: unknown) {
            console.error('Backup export failed:', err);
            setBackupImportError({ isOpen: true, message: 'Failed to export backup. Please try again.' });
        }
    };

    const verifyBackupFile = async (file: File) => {
        setBackupImportLoading(true);
        try {
            const formData = new FormData();
            formData.append('archive', file);
            const response = await api.api.post<{
                valid: boolean;
                formatVersion: number;
                exportedAt: string;
                excalidashBackendVersion: string | null;
                collections: number;
                drawings: number;
            }>('/import/excalidash/verify', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            setBackupImportConfirmation({
                isOpen: true,
                file,
                info: {
                    formatVersion: response.data.formatVersion,
                    exportedAt: response.data.exportedAt,
                    excalidashBackendVersion: response.data.excalidashBackendVersion ?? null,
                    collections: response.data.collections,
                    drawings: response.data.drawings,
                },
            });
        } catch (err: unknown) {
            console.error('Backup verify failed:', err);
            let message = 'Failed to verify backup file.';
            if (api.isAxiosError(err)) {
                message = err.response?.data?.message || err.response?.data?.error || message;
            }
            setBackupImportError({ isOpen: true, message });
        } finally {
            setBackupImportLoading(false);
        }
    };

    const verifyLegacyDbFile = async (file: File) => {
        setLegacyDbImportLoading(true);
        try {
            const formData = new FormData();
            formData.append('db', file);
            const response = await api.api.post<{
                valid: boolean;
                drawings: number;
                collections: number;
                latestMigration: string | null;
                currentLatestMigration: string | null;
            }>('/import/sqlite/legacy/verify', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            setLegacyDbImportConfirmation({
                isOpen: true,
                file,
                info: {
                    drawings: response.data.drawings,
                    collections: response.data.collections,
                    legacyLatestMigration: response.data.latestMigration ?? null,
                    currentLatestMigration: response.data.currentLatestMigration ?? null,
                },
            });
        } catch (err: unknown) {
            console.error('Legacy DB verify failed:', err);
            let message = 'Failed to verify legacy database file.';
            if (api.isAxiosError(err)) {
                message = err.response?.data?.message || err.response?.data?.error || message;
            }
            setImportError({ isOpen: true, message });
        } finally {
            setLegacyDbImportLoading(false);
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
            <h1 className="text-3xl sm:text-4xl lg:text-5xl mb-6 lg:mb-8 text-slate-900 dark:text-white pl-1" style={{ fontFamily: 'Excalifont' }}>
                Settings
            </h1>

            {authToggleError && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl">
                    <p className="text-red-800 dark:text-red-200 font-medium">{authToggleError}</p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                <div className="flex flex-col items-center justify-center gap-3 sm:gap-4 p-4 sm:p-6 lg:p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 bg-indigo-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-indigo-100 dark:border-neutral-700">
                        <Archive size={32} className="text-indigo-600 dark:text-indigo-400 hidden sm:block" />
                        <Archive size={24} className="text-indigo-600 dark:text-indigo-400 sm:hidden" />
                    </div>
                    <div className="text-center">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Export Backup</h3>
                        <p className="text-xs text-slate-500 dark:text-neutral-400 font-medium max-w-[200px] mx-auto">
                            Exports an `.excalidash` archive organized by collections
                        </p>
                    </div>
                    <div className="w-full flex flex-col items-stretch gap-2 pt-2">
                        <button
                            onClick={exportBackup}
                            className="w-full px-4 py-2 text-sm font-bold rounded-xl border-2 border-black dark:border-neutral-700 bg-indigo-600 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 transition-all"
                        >
                            Export
                        </button>
                        <select
                            value={backupExportExt}
                            onChange={(e) => setBackupExportExt(e.target.value as any)}
                            className="w-full px-3 py-2 text-sm font-bold rounded-xl border-2 border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-white"
                            title="Download name"
                        >
                            <option value="excalidash">.excalidash</option>
                            <option value="excalidash.zip">.excalidash.zip</option>
                        </select>
                    </div>
                </div>

                <button
                    onClick={toggleTheme}
                    className="w-full flex flex-col items-center justify-center gap-3 sm:gap-4 p-4 sm:p-6 lg:p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 transition-all duration-200 group"
                >
                    <div className="w-12 h-12 sm:w-16 sm:h-16 bg-amber-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-amber-100 dark:border-neutral-700 group-hover:border-amber-200 dark:group-hover:border-neutral-600 transition-colors">
                        {theme === 'light' ? (
                            <Moon size={32} className="text-amber-600 dark:text-amber-400 hidden sm:block" />
                        ) : (
                            <Sun size={32} className="text-amber-600 dark:text-amber-400 hidden sm:block" />
                        )}
                        {theme === 'light' ? (
                            <Moon size={24} className="text-amber-600 dark:text-amber-400 sm:hidden" />
                        ) : (
                            <Sun size={24} className="text-amber-600 dark:text-amber-400 sm:hidden" />
                        )}
                    </div>
                    <div className="text-center">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                            {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-neutral-400 font-medium max-w-[200px] mx-auto">
                            Switch to {theme === 'light' ? 'dark' : 'light'} theme
                        </p>
                    </div>
                </button>

                <button
                    onClick={toggleImageCompression}
                    className="w-full flex flex-col items-center justify-center gap-3 sm:gap-4 p-4 sm:p-6 lg:p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 transition-all duration-200 group"
                >
                    <div className="w-12 h-12 sm:w-16 sm:h-16 bg-blue-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-blue-100 dark:border-neutral-700 group-hover:border-blue-200 dark:group-hover:border-neutral-600 transition-colors">
                        {imageCompression ? (
                            <Zap size={32} className="text-blue-600 dark:text-blue-400 hidden sm:block" />
                        ) : (
                            <ZapOff size={32} className="text-blue-600 dark:text-blue-400 hidden sm:block" />
                        )}
                        {imageCompression ? (
                            <Zap size={24} className="text-blue-600 dark:text-blue-400 sm:hidden" />
                        ) : (
                            <ZapOff size={24} className="text-blue-600 dark:text-blue-400 sm:hidden" />
                        )}
                    </div>
                    <div className="text-center">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                            {imageCompression ? 'Optimized Images' : 'Raw Images'}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-neutral-400 font-medium max-w-[200px] mx-auto">
                            {imageCompression ? 'Lossy compression enabled' : 'Lossless (high bandwidth) enabled'}
                        </p>
                    </div>
                </button>

                <div className="flex flex-col p-4 sm:p-6 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]">
                    <div className="flex items-center gap-3 sm:gap-4 mb-6">
                        <div className="w-12 h-12 sm:w-16 sm:h-16 flex-shrink-0 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl flex items-center justify-center border-2 border-emerald-100 dark:border-emerald-800/50 relative overflow-hidden group">
                            <div className="absolute inset-0 opacity-[0.2] bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] [background-size:12px_12px]"></div>
                            <RefreshCw size={28} className={clsx("text-emerald-600 dark:text-emerald-400 relative z-10 sm:hidden", updateLoading && "animate-spin")} />
                            <RefreshCw size={32} className={clsx("text-emerald-600 dark:text-emerald-400 relative z-10 hidden sm:block", updateLoading && "animate-spin")} />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate">Updates</h3>
                        </div>
                    </div>

                    <div className="space-y-4 flex-1">
                        <div className="p-3 sm:p-4 rounded-xl border-2 border-slate-100 dark:border-neutral-800 bg-slate-50/50 dark:bg-neutral-800/30">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500" htmlFor="settings-update-channel">
                                    Channel
                                </label>
                                <span className={clsx(
                                    "px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-tighter border",
                                    updateChannel === 'stable' 
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50" 
                                        : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/50"
                                )}>
                                    {updateChannel}
                                </span>
                            </div>
                            <select
                                id="settings-update-channel"
                                value={updateChannel}
                                onChange={(e) => {
                                    const next = (e.target.value === 'prerelease' ? 'prerelease' : 'stable') as api.UpdateChannel;
                                    try {
                                        window.localStorage?.setItem?.(UPDATE_CHANNEL_KEY, next);
                                    } catch {
                                    }
                                    setUpdateChannel(next);
                                    void checkForUpdates(next);
                                }}
                                className="w-full h-10 px-2 sm:px-3 rounded-lg border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
                            >
                                <option value="stable">Stable</option>
                                <option value="prerelease">Prerelease</option>
                            </select>
                        </div>

                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between px-1">
                                <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-neutral-500 uppercase tracking-widest">Current Status</span>
                            </div>
                            <div className={clsx(
                                "px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border-2 font-bold text-xs sm:text-sm flex items-center gap-2 sm:gap-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]",
                                updateInfo?.outboundEnabled === false ? "bg-slate-50 border-slate-200 text-slate-500 dark:bg-neutral-800 dark:border-neutral-700" :
                                updateLoading ? "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/20 dark:border-indigo-800 dark:text-indigo-300" :
                                updateInfo?.isUpdateAvailable ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50" :
                                updateError ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300" :
                                "bg-slate-50 border-slate-200 text-slate-600 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-300"
                            )}>
                                {updateLoading && <RefreshCw size={14} className="animate-spin flex-shrink-0" />}
                                <span className="truncate">
                                    {updateInfo?.outboundEnabled === false ? "Checks disabled" :
                                     updateLoading ? "Checking..." :
                                     updateInfo?.isUpdateAvailable ? `v${updateInfo.latestVersion} available` :
                                     updateInfo?.latestVersion ? (
                                        <span className="flex items-center gap-1.5">
                                            <Check size={14} strokeWidth={3} className="text-emerald-500 flex-shrink-0" />
                                            Up to date
                                        </span>
                                     ) :
                                     updateError ? updateError :
                                     "Status unknown"}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 sm:mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                            onClick={() => void checkForUpdates(updateChannel)}
                            disabled={updateLoading}
                            className="flex items-center justify-center gap-2 h-10 sm:h-11 rounded-xl border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-900 dark:text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] text-[9px] sm:text-[10px] font-black uppercase tracking-wider hover:-translate-y-0.5 transition-all active:translate-y-0 active:shadow-none disabled:opacity-50"
                            type="button"
                        >
                            Check Now
                        </button>

                        <a
                            href="https://github.com/ZimengXiong/ExcaliDash/releases"
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-center gap-2 h-10 sm:h-11 rounded-xl border-2 border-black dark:border-neutral-700 bg-indigo-600 text-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-[9px] sm:text-[10px] font-black uppercase tracking-wider hover:-translate-y-0.5 transition-all active:translate-y-0 active:shadow-none"
                        >
                            Releases
                        </a>
                    </div>

                    {updateInfo?.error && !updateLoading && (
                        <div className="mt-4 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-[10px] font-bold text-red-600 dark:text-red-400 italic">
                            Error: {updateInfo.error}
                        </div>
                    )}
                </div>
            </div>

            <details className="mt-8 bg-white/30 dark:bg-neutral-900/30 border border-slate-200/70 dark:border-neutral-800/70 rounded-2xl p-4 sm:p-6">
                <summary className="cursor-pointer select-none font-bold text-slate-800 dark:text-neutral-200">
                    Advanced / Legacy
                </summary>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    <div className="relative">
                        <input
                            type="file"
                            accept=".excalidash,.zip"
                            className="hidden"
                            id="settings-import-backup"
                            onChange={async (e) => {
                                const file = (e.target.files || [])[0];
                                if (!file) return;
                                await verifyBackupFile(file);
                                e.target.value = '';
                            }}
                        />
                        <button
                            onClick={() => document.getElementById('settings-import-backup')?.click()}
                            disabled={backupImportLoading}
                            className="w-full h-full flex flex-col items-center justify-center gap-3 sm:gap-4 p-4 sm:p-6 lg:p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-blue-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-blue-100 dark:border-neutral-700">
                                <Upload size={32} className="text-blue-600 dark:text-blue-400 hidden sm:block" />
                                <Upload size={24} className="text-blue-600 dark:text-blue-400 sm:hidden" />
                            </div>
                            <div className="text-center">
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                                    {backupImportLoading ? 'Verifying…' : 'Import Backup'}
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-neutral-400 font-medium max-w-[200px] mx-auto">
                                    Merge-import a `.excalidash` backup into your account
                                </p>
                            </div>
                        </button>
                    </div>

                    <button
                        onClick={confirmToggleAuthEnabled}
                        disabled={
                            isManagedAuthMode ||
                            authEnabled === null ||
                            authToggleLoading ||
                            (authEnabled === true && user?.role !== 'ADMIN')
                        }
                        className="w-full flex flex-col items-center justify-center gap-3 sm:gap-4 p-4 sm:p-6 lg:p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 transition-all duration-200 group disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] disabled:hover:translate-y-0"
                    >
                        <div className="w-12 h-12 sm:w-16 sm:h-16 bg-slate-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-slate-200 dark:border-neutral-700 group-hover:border-slate-300 dark:group-hover:border-neutral-600 transition-colors">
                            <Info size={32} className="text-slate-700 dark:text-neutral-300 hidden sm:block" />
                            <Info size={24} className="text-slate-700 dark:text-neutral-300 sm:hidden" />
                        </div>
                        <div className="text-center">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                                {authEnabled ? 'Authentication: On' : 'Authentication: Off'}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-neutral-400 font-medium max-w-[200px] mx-auto">
                                {isManagedAuthMode
                                    ? `Managed by AUTH_MODE=${authMode}`
                                    : authEnabled
                                        ? user?.role === 'ADMIN'
                                            ? (authToggleLoading ? 'Disabling…' : 'Disable multi-user login')
                                            : 'Only admins can disable'
                                        : authToggleLoading
                                            ? 'Enabling…'
                                            : 'Enable multi-user login'}
                            </p>
                        </div>
                    </button>

                    <div className="relative">
                        <input
                            type="file"
                            multiple
                            accept=".sqlite,.db,.json,.excalidraw,.zip"
                            className="hidden"
                            id="settings-import-legacy"
                            onChange={async (e) => {
                                const files = Array.from(e.target.files || []);
                                if (files.length === 0) return;

                                const databaseFile = files.find(f => f.name.endsWith('.sqlite') || f.name.endsWith('.db'));
                                if (databaseFile) {
                                    if (files.length > 1) {
                                        setImportError({ isOpen: true, message: 'Please import legacy database files separately from other files.' });
                                        e.target.value = '';
                                        return;
                                    }

                                    await verifyLegacyDbFile(databaseFile);
                                    e.target.value = '';
                                    return;
                                }

                                const result = await importLegacyFiles(files, null, () => { });

                                if (result.failed > 0) {
                                    setImportError({
                                        isOpen: true,
                                        message: `Import complete with errors.\nSuccess: ${result.success}\nFailed: ${result.failed}\nErrors:\n${result.errors.join('\n')}`
                                    });
                                } else {
                                    setImportSuccess({ isOpen: true, message: `Imported ${result.success} file(s).` });
                                }

                                e.target.value = '';
                            }}
                        />
                        <button
                            onClick={() => document.getElementById('settings-import-legacy')?.click()}
                            disabled={legacyDbImportLoading}
                            className="w-full h-full flex flex-col items-center justify-center gap-3 sm:gap-4 p-4 sm:p-6 lg:p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 transition-all duration-200 group"
                        >
                            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-amber-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-amber-100 dark:border-neutral-700">
                                <Upload size={32} className="text-amber-600 dark:text-amber-400 hidden sm:block" />
                                <Upload size={24} className="text-amber-600 dark:text-amber-400 sm:hidden" />
                            </div>
                            <div className="text-center">
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Legacy Import</h3>
                                <p className="text-xs text-slate-500 dark:text-neutral-400 font-medium max-w-[200px] mx-auto">Import `.excalidraw`, legacy JSON, or merge a legacy `.db`</p>
                            </div>
                        </button>
                    </div>

                    <div className="flex flex-col items-center justify-center gap-3 sm:gap-4 p-4 sm:p-6 lg:p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]">
                        <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-gray-100 dark:border-neutral-700">
                            <Info size={32} className="text-gray-600 dark:text-gray-400 hidden sm:block" />
                            <Info size={24} className="text-gray-600 dark:text-gray-400 sm:hidden" />
                        </div>
                        <div className="text-center">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Version Info</h3>
                            <div className="text-[10px] sm:text-xs text-slate-500 dark:text-neutral-400 font-bold flex flex-col items-center gap-1">
                                <span className="text-sm sm:text-base text-slate-900 dark:text-white">
                                    {appVersion}
                                </span>
                                {buildLabel && (
                                    <span className="uppercase tracking-wide text-red-500 dark:text-red-400">
                                        {buildLabel}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </details>

            <ConfirmModal
                isOpen={legacyDbImportConfirmation.isOpen}
                title="Merge-import legacy database?"
                message={
                    <div className="space-y-2">
                        <div>This will merge legacy data into your account (it will not replace the server database).</div>
                        {legacyDbImportConfirmation.info && (
                            <div className="text-sm text-slate-700 dark:text-neutral-200 space-y-1">
                                <div>Drawings: {legacyDbImportConfirmation.info.drawings}</div>
                                <div>Collections: {legacyDbImportConfirmation.info.collections}</div>
                                <div>Legacy migration: {legacyDbImportConfirmation.info.legacyLatestMigration || 'Unknown'}</div>
                                <div>Current migration: {legacyDbImportConfirmation.info.currentLatestMigration || 'Unknown'}</div>
                            </div>
                        )}
                    </div>
                }
                confirmText="Merge Import"
                cancelText="Cancel"
                onConfirm={async () => {
                    const file = legacyDbImportConfirmation.file;
                    if (!file) return;
                    setLegacyDbImportConfirmation({ isOpen: false, file: null, info: null });

                    const formData = new FormData();
                    formData.append('db', file);

                    try {
                        const response = await api.api.post<{
                            success: boolean;
                            collections: { created: number; updated: number; idConflicts: number };
                            drawings: { created: number; updated: number; idConflicts: number };
                        }>('/import/sqlite/legacy', formData, {
                            headers: { 'Content-Type': 'multipart/form-data' },
                        });

                        setImportSuccess({
                            isOpen: true,
                            message: `Legacy DB imported. Collections: +${response.data.collections.created} / ~${response.data.collections.updated}. Drawings: +${response.data.drawings.created} / ~${response.data.drawings.updated}.`,
                        });
                    } catch (err: unknown) {
                        console.error(err);
                        let message = 'Failed to import legacy database.';
                        if (api.isAxiosError(err)) {
                            message = err.response?.data?.message || err.response?.data?.error || message;
                        }
                        setImportError({ isOpen: true, message });
                    }
                }}
                onCancel={() => setLegacyDbImportConfirmation({ isOpen: false, file: null, info: null })}
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
                isOpen={importSuccess.isOpen}
                title="Import Successful"
                message={importSuccess.message}
                confirmText="OK"
                showCancel={false}
                isDangerous={false}
                variant="success"
                onConfirm={() => setImportSuccess({ isOpen: false, message: '' })}
                onCancel={() => setImportSuccess({ isOpen: false, message: '' })}
            />

            <ConfirmModal
                isOpen={authToggleConfirm.isOpen}
                title={authToggleConfirm.nextEnabled ? 'Enable authentication?' : 'Disable authentication?'}
                message={
                    authToggleConfirm.nextEnabled
                        ? 'This will require users to sign in. You will be prompted to set up an admin account immediately.'
                        : (
                            <div className="space-y-2 text-left">
                                <div>
                                    This will turn off authentication for the entire instance.
                                </div>
                                <div className="font-semibold text-rose-700 dark:text-rose-300">
                                    Recommendation: keep authentication enabled unless this instance is fully private.
                                </div>
                            </div>
                        )
                }
                confirmText={authToggleConfirm.nextEnabled ? 'Enable' : 'Continue'}
                cancelText="Cancel"
                isDangerous={!authToggleConfirm.nextEnabled}
                onConfirm={async () => {
                    const nextEnabled = authToggleConfirm.nextEnabled;
                    setAuthToggleConfirm({ isOpen: false, nextEnabled: null });
                    if (typeof nextEnabled !== 'boolean') return;
                    if (!nextEnabled) {
                        setAuthDisableFinalConfirmOpen(true);
                        return;
                    }
                    await setAuthEnabled(nextEnabled);
                }}
                onCancel={() => setAuthToggleConfirm({ isOpen: false, nextEnabled: null })}
            />

            <ConfirmModal
                isOpen={authDisableFinalConfirmOpen}
                title="Final warning: disable authentication?"
                message={
                    <div className="space-y-2 text-left">
                        <div>
                            With authentication off, any user who can access this URL can view and modify all drawings and settings. They can also turn authentication back on and lock you out.
                        </div>
                        <div className="font-semibold text-rose-700 dark:text-rose-300">
                            This is only safe on a trusted private network.
                        </div>
                    </div>
                }
                confirmText="Disable Authentication"
                cancelText="Keep Enabled (Recommended)"
                isDangerous
                onConfirm={async () => {
                    setAuthDisableFinalConfirmOpen(false);
                    await setAuthEnabled(false);
                }}
                onCancel={() => setAuthDisableFinalConfirmOpen(false)}
            />

            <ConfirmModal
                isOpen={backupImportConfirmation.isOpen}
                title="Import backup?"
                message={
                    backupImportConfirmation.info
                        ? `This will merge ${backupImportConfirmation.info.collections} collection(s) and ${backupImportConfirmation.info.drawings} drawing(s) from a Format v${backupImportConfirmation.info.formatVersion} backup exported at ${backupImportConfirmation.info.exportedAt}.`
                        : 'This will merge the backup into your account.'
                }
                confirmText="Import"
                cancelText="Cancel"
                isDangerous={false}
                onConfirm={async () => {
                    const file = backupImportConfirmation.file;
                    if (!file) return;
                    setBackupImportConfirmation({ ...backupImportConfirmation, isOpen: false });
                    setBackupImportLoading(true);
                    try {
                        const formData = new FormData();
                        formData.append('archive', file);
                        await api.api.post('/import/excalidash', formData, {
                            headers: { 'Content-Type': 'multipart/form-data' },
                        });
                        setBackupImportConfirmation({ isOpen: false, file: null, info: null });
                        setBackupImportSuccess(true);
                    } catch (err: unknown) {
                        console.error('Backup import failed:', err);
                        let message = 'Failed to import backup.';
                        if (api.isAxiosError(err)) {
                            message = err.response?.data?.message || err.response?.data?.error || message;
                        }
                        setBackupImportError({ isOpen: true, message });
                        setBackupImportConfirmation({ isOpen: false, file: null, info: null });
                    } finally {
                        setBackupImportLoading(false);
                    }
                }}
                onCancel={() => setBackupImportConfirmation({ isOpen: false, file: null, info: null })}
            />

            <ConfirmModal
                isOpen={backupImportSuccess}
                title="Backup Imported"
                message="Backup imported successfully."
                confirmText="OK"
                showCancel={false}
                isDangerous={false}
                variant="success"
                onConfirm={() => setBackupImportSuccess(false)}
                onCancel={() => setBackupImportSuccess(false)}
            />

            <ConfirmModal
                isOpen={backupImportError.isOpen}
                title="Backup Import Failed"
                message={backupImportError.message}
                confirmText="OK"
                cancelText=""
                showCancel={false}
                isDangerous={false}
                onConfirm={() => setBackupImportError({ isOpen: false, message: '' })}
                onCancel={() => setBackupImportError({ isOpen: false, message: '' })}
            />
        </Layout >
    );
};
