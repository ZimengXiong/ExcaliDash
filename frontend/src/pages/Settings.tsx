import React, { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import * as api from '../api';
import type { Collection } from '../types';
import { Database, FileJson, Upload, Moon, Sun, Info, HardDrive, Users, LogOut, User, KeyRound, Pencil, Loader2 } from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { importDrawings } from '../utils/importUtils';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

export const Settings: React.FC = () => {
    const [collections, setCollections] = useState<Collection[]>([]);
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();
    const { user, logout, updateProfile, refreshUser } = useAuth();

    // Import state
    const [importConfirmation, setImportConfirmation] = useState<{ isOpen: boolean; file: File | null }>({ isOpen: false, file: null });
    const [importError, setImportError] = useState<{ isOpen: boolean; message: string }>({ isOpen: false, message: '' });
    const [importSuccess, setImportSuccess] = useState(false);

    // Account state
    const [logoutConfirm, setLogoutConfirm] = useState(false);
    const [changePasswordModal, setChangePasswordModal] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState(false);
    const [passwordLoading, setPasswordLoading] = useState(false);

    // Edit Profile state
    const [editProfileModal, setEditProfileModal] = useState(false);
    const [editDisplayName, setEditDisplayName] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [profileError, setProfileError] = useState('');
    const [profileSuccess, setProfileSuccess] = useState(false);
    const [profileLoading, setProfileLoading] = useState(false);

    // Export state
    const [exportLoading, setExportLoading] = useState<string | null>(null);

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

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    const handleChangePassword = async () => {
        setPasswordError('');
        
        if (newPassword !== confirmPassword) {
            setPasswordError('Passwords do not match');
            return;
        }
        
        if (newPassword.length < 8) {
            setPasswordError('Password must be at least 8 characters');
            return;
        }

        setPasswordLoading(true);
        try {
            await api.api.put('/auth/me', {
                currentPassword,
                newPassword
            });
            setPasswordSuccess(true);
            setChangePasswordModal(false);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err: any) {
            setPasswordError(err.response?.data?.error || 'Failed to change password');
        } finally {
            setPasswordLoading(false);
        }
    };

    const handleEditProfile = async () => {
        setProfileError('');

        if (!editEmail.trim()) {
            setProfileError('Email is required');
            return;
        }

        setProfileLoading(true);
        try {
            await updateProfile({
                displayName: editDisplayName.trim() || undefined,
                email: editEmail.trim(),
            });
            setProfileSuccess(true);
            setEditProfileModal(false);
        } catch (err: any) {
            setProfileError(err.response?.data?.error || 'Failed to update profile');
        } finally {
            setProfileLoading(false);
        }
    };

    const openEditProfileModal = () => {
        setEditDisplayName(user?.displayName || '');
        setEditEmail(user?.email || '');
        setProfileError('');
        setEditProfileModal(true);
    };

    const handleExport = async (format: 'sqlite' | 'db' | 'json') => {
        setExportLoading(format);
        try {
            const token = localStorage.getItem('excalidash_token');
            const url = format === 'json' 
                ? `${api.API_URL}/export/json`
                : `${api.API_URL}/export${format === 'db' ? '?format=db' : ''}`;
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Export failed');
            }

            // Get filename from Content-Disposition header
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = `excalidash-export.${format === 'json' ? 'json' : format}`;
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="?(.+)"?/);
                if (match) filename = match[1];
            }

            // Download the file
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(downloadUrl);
            a.remove();
        } catch (err: any) {
            setImportError({ isOpen: true, message: err.message || 'Export failed' });
        } finally {
            setExportLoading(null);
        }
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

                {/* Account Info - Editable */}
                <button
                    onClick={openEditProfileModal}
                    className="flex flex-col items-center justify-center gap-4 p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 transition-all duration-200 group"
                >
                    <div className="relative">
                        <div className="w-16 h-16 bg-violet-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-violet-100 dark:border-neutral-700 group-hover:border-violet-200 dark:group-hover:border-neutral-600 transition-colors">
                            <User size={32} className="text-violet-600 dark:text-violet-400" />
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-white dark:bg-neutral-800 rounded-full flex items-center justify-center border-2 border-violet-200 dark:border-neutral-600">
                            <Pencil size={12} className="text-violet-600 dark:text-violet-400" />
                        </div>
                    </div>
                    <div className="text-center">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Edit Profile</h3>
                        <p className="text-sm text-slate-500 dark:text-neutral-400 font-medium">
                            {user?.displayName || user?.username || 'User'}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-neutral-500">
                            {user?.email}
                        </p>
                    </div>
                </button>

                {/* Change Password */}
                <button
                    onClick={() => setChangePasswordModal(true)}
                    className="flex flex-col items-center justify-center gap-4 p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 transition-all duration-200 group"
                >
                    <div className="w-16 h-16 bg-cyan-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-cyan-100 dark:border-neutral-700 group-hover:border-cyan-200 dark:group-hover:border-neutral-600 transition-colors">
                        <KeyRound size={32} className="text-cyan-600 dark:text-cyan-400" />
                    </div>
                    <div className="text-center">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Change Password</h3>
                        <p className="text-sm text-slate-500 dark:text-neutral-400 font-medium">Update your password</p>
                    </div>
                </button>

                {/* Log Out */}
                <button
                    onClick={() => setLogoutConfirm(true)}
                    className="flex flex-col items-center justify-center gap-4 p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 transition-all duration-200 group"
                >
                    <div className="w-16 h-16 bg-rose-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-rose-100 dark:border-neutral-700 group-hover:border-rose-200 dark:group-hover:border-neutral-600 transition-colors">
                        <LogOut size={32} className="text-rose-600 dark:text-rose-400" />
                    </div>
                    <div className="text-center">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Log Out</h3>
                        <p className="text-sm text-slate-500 dark:text-neutral-400 font-medium">Sign out of your account</p>
                    </div>
                </button>

                {/* Manage Users - Admin Only */}
                {user?.role === 'ADMIN' && (
                    <button
                        onClick={() => navigate('/admin')}
                        className="flex flex-col items-center justify-center gap-4 p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 transition-all duration-200 group"
                    >
                        <div className="w-16 h-16 bg-orange-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-orange-100 dark:border-neutral-700 group-hover:border-orange-200 dark:group-hover:border-neutral-600 transition-colors">
                            <Users size={32} className="text-orange-600 dark:text-orange-400" />
                        </div>
                        <div className="text-center">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Manage Users</h3>
                            <p className="text-sm text-slate-500 dark:text-neutral-400 font-medium">Admin user management</p>
                        </div>
                    </button>
                )}

                {/* Export SQLite (.sqlite) - Admin Only */}
                {user?.role === 'ADMIN' && (
                    <button
                        onClick={() => handleExport('sqlite')}
                        disabled={exportLoading === 'sqlite'}
                        className="flex flex-col items-center justify-center gap-4 p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 transition-all duration-200 group disabled:opacity-50"
                    >
                        <div className="w-16 h-16 bg-indigo-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-indigo-100 dark:border-neutral-700 group-hover:border-indigo-200 dark:group-hover:border-neutral-600 transition-colors">
                            {exportLoading === 'sqlite' ? (
                                <Loader2 size={32} className="text-indigo-600 dark:text-indigo-400 animate-spin" />
                            ) : (
                                <Database size={32} className="text-indigo-600 dark:text-indigo-400" />
                            )}
                        </div>
                        <div className="text-center">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Export Data (.sqlite)</h3>
                            <p className="text-sm text-slate-500 dark:text-neutral-400 font-medium">Download full database backup</p>
                        </div>
                    </button>
                )}

                {/* Export SQLite (.db) - Admin Only */}
                {user?.role === 'ADMIN' && (
                    <button
                        onClick={() => handleExport('db')}
                        disabled={exportLoading === 'db'}
                        className="flex flex-col items-center justify-center gap-4 p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 transition-all duration-200 group disabled:opacity-50"
                    >
                        <div className="w-16 h-16 bg-blue-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-blue-100 dark:border-neutral-700 group-hover:border-blue-200 dark:group-hover:border-neutral-600 transition-colors">
                            {exportLoading === 'db' ? (
                                <Loader2 size={32} className="text-blue-600 dark:text-blue-400 animate-spin" />
                            ) : (
                                <HardDrive size={32} className="text-blue-600 dark:text-blue-400" />
                            )}
                        </div>
                        <div className="text-center">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Export Data (.db)</h3>
                            <p className="text-sm text-slate-500 dark:text-neutral-400 font-medium">Download Prisma .db format</p>
                        </div>
                    </button>
                )}

                {/* Export JSON - User's drawings only */}
                <button
                    onClick={() => handleExport('json')}
                    disabled={exportLoading === 'json'}
                    className="flex flex-col items-center justify-center gap-4 p-8 bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-1 transition-all duration-200 group disabled:opacity-50"
                >
                    <div className="w-16 h-16 bg-emerald-50 dark:bg-neutral-800 rounded-2xl flex items-center justify-center border-2 border-emerald-100 dark:border-neutral-700 group-hover:border-emerald-200 dark:group-hover:border-neutral-600 transition-colors">
                        {exportLoading === 'json' ? (
                            <Loader2 size={32} className="text-emerald-600 dark:text-emerald-400 animate-spin" />
                        ) : (
                            <FileJson size={32} className="text-emerald-600 dark:text-emerald-400" />
                        )}
                    </div>
                    <div className="text-center">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Export My Drawings</h3>
                        <p className="text-sm text-slate-500 dark:text-neutral-400 font-medium">Download your drawings as JSON</p>
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

                                const token = localStorage.getItem('excalidash_token');

                                try {
                                    const res = await fetch(`${api.API_URL}/import/sqlite/verify`, {
                                        method: 'POST',
                                        body: formData,
                                        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
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

                    const token = localStorage.getItem('excalidash_token');

                    try {
                        const res = await fetch(`${api.API_URL}/import/sqlite`, {
                            method: 'POST',
                            body: formData,
                            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
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

            {/* Logout Confirmation */}
            <ConfirmModal
                isOpen={logoutConfirm}
                title="Log Out"
                message="Are you sure you want to log out?"
                confirmText="Log Out"
                onConfirm={handleLogout}
                onCancel={() => setLogoutConfirm(false)}
            />

            {/* Password Change Success */}
            <ConfirmModal
                isOpen={passwordSuccess}
                title="Password Changed"
                message="Your password has been updated successfully."
                confirmText="OK"
                showCancel={false}
                isDangerous={false}
                variant="success"
                onConfirm={() => setPasswordSuccess(false)}
                onCancel={() => setPasswordSuccess(false)}
            />

            {/* Change Password Modal */}
            {changePasswordModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl border-2 border-black dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] p-6 max-w-md w-full mx-4">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Change Password</h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-1">
                                    Current Password
                                </label>
                                <input
                                    type="password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    className="w-full px-4 py-2 border-2 border-black dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-1">
                                    New Password
                                </label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full px-4 py-2 border-2 border-black dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-1">
                                    Confirm New Password
                                </label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full px-4 py-2 border-2 border-black dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>

                            {passwordError && (
                                <p className="text-sm text-rose-600 dark:text-rose-400">{passwordError}</p>
                            )}
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setChangePasswordModal(false);
                                    setCurrentPassword('');
                                    setNewPassword('');
                                    setConfirmPassword('');
                                    setPasswordError('');
                                }}
                                className="flex-1 px-4 py-2 border-2 border-black dark:border-neutral-700 rounded-lg font-bold text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-neutral-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleChangePassword}
                                disabled={passwordLoading}
                                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                            >
                                {passwordLoading ? 'Updating...' : 'Update Password'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Profile Modal */}
            {editProfileModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white dark:bg-neutral-900 rounded-2xl border-2 border-black dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] p-6 max-w-md w-full mx-4">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Edit Profile</h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-1">
                                    Display Name
                                </label>
                                <input
                                    type="text"
                                    value={editDisplayName}
                                    onChange={(e) => setEditDisplayName(e.target.value)}
                                    placeholder="Enter your display name"
                                    className="w-full px-4 py-2 border-2 border-black dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-1">
                                    Email
                                </label>
                                <input
                                    type="email"
                                    value={editEmail}
                                    onChange={(e) => setEditEmail(e.target.value)}
                                    placeholder="Enter your email"
                                    className="w-full px-4 py-2 border-2 border-black dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>

                            {profileError && (
                                <p className="text-sm text-rose-600 dark:text-rose-400">{profileError}</p>
                            )}
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setEditProfileModal(false);
                                    setEditDisplayName('');
                                    setEditEmail('');
                                    setProfileError('');
                                }}
                                className="flex-1 px-4 py-2 border-2 border-black dark:border-neutral-700 rounded-lg font-bold text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-neutral-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleEditProfile}
                                disabled={profileLoading}
                                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                            >
                                {profileLoading ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Profile Update Success */}
            <ConfirmModal
                isOpen={profileSuccess}
                title="Profile Updated"
                message="Your profile has been updated successfully."
                confirmText="OK"
                showCancel={false}
                isDangerous={false}
                variant="success"
                onConfirm={() => setProfileSuccess(false)}
                onCancel={() => setProfileSuccess(false)}
            />
        </Layout >
    );
};
