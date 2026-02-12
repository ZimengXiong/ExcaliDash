import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import type { Collection } from '../types';
import { User, Lock, Save, X, Shield } from 'lucide-react';
import { USER_KEY } from '../utils/impersonation';
import {
    getPasswordRequirementsLabel,
    validatePasswordForCurrentEnv,
} from '../utils/passwordPolicy';

export const Profile: React.FC = () => {
    const { user: authUser, logout, authEnabled } = useAuth();
    const navigate = useNavigate();
    const isAdmin = authUser?.role === 'ADMIN';
    const mustResetPassword = Boolean(authUser?.mustResetPassword);
    const [collections, setCollections] = useState<Collection[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [registrationEnabled, setRegistrationEnabled] = useState<boolean | null>(null);
    const [registrationLoading, setRegistrationLoading] = useState(false);

    // User info state
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [showEmailForm, setShowEmailForm] = useState(false);
    const [emailCurrentPassword, setEmailCurrentPassword] = useState('');
    const [emailLoading, setEmailLoading] = useState(false);

    // Password change state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPasswordForm, setShowPasswordForm] = useState(false);

    useEffect(() => {
        if (authEnabled === false) {
            navigate('/settings', { replace: true });
            return;
        }
        const fetchData = async () => {
            try {
                const collectionsData = await api.getCollections();
                setCollections(collectionsData);
                
                // Fetch user info
                if (authUser) {
                    setName(authUser.name);
                    setEmail(authUser.email);
                }

                if (isAdmin) {
                    const statusResponse = await api.api.get<{ registrationEnabled: boolean }>('/auth/status');
                    setRegistrationEnabled(statusResponse.data.registrationEnabled);
                } else {
                    setRegistrationEnabled(null);
                }
            } catch (err) {
                console.error('Failed to fetch data:', err);
            }
        };
        fetchData();
    }, [authEnabled, authUser, isAdmin, navigate]);

    useEffect(() => {
        if (mustResetPassword) {
            setShowPasswordForm(true);
        }
    }, [mustResetPassword]);

    const handleToggleRegistration = async () => {
        if (!isAdmin || registrationEnabled === null) return;

        setRegistrationLoading(true);
        setError('');
        setSuccess('');

        try {
            const response = await api.api.post<{ registrationEnabled: boolean }>('/auth/registration/toggle', {
                enabled: !registrationEnabled,
            });
            setRegistrationEnabled(response.data.registrationEnabled);
            setSuccess(response.data.registrationEnabled ? 'Registration enabled' : 'Registration disabled');
        } catch (err: unknown) {
            let message = 'Failed to update registration setting';
            if (api.isAxiosError(err)) {
                if (err.response?.data?.message) {
                    message = err.response.data.message;
                } else if (err.response?.data?.error) {
                    message = err.response.data.error;
                }
            }
            setError(message);
        } finally {
            setRegistrationLoading(false);
        }
    };

    const handleSelectCollection = (id: string | null | undefined) => {
        if (id === undefined) navigate('/');
        else if (id === null) navigate('/collections?id=unorganized');
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

    const handleUpdateName = async () => {
        if (mustResetPassword) {
            setError('You must reset your password before updating your profile');
            return;
        }
        if (!name.trim()) {
            setError('Name cannot be empty');
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const response = await api.api.put<{ user: { id: string; email: string; name: string; createdAt: string; updatedAt: string } }>('/auth/profile', { name: name.trim() });
            setSuccess('Name updated successfully');
            // Update auth context - refresh user data
            if (response.data?.user) {
                // Update localStorage with new user data
                localStorage.setItem('excalidash-user', JSON.stringify(response.data.user));
                // Reload to update auth context
                setTimeout(() => window.location.reload(), 500);
            }
        } catch (err: unknown) {
            let message = 'Failed to update name';
            if (api.isAxiosError(err)) {
                if (err.response?.data?.message) {
                    message = err.response.data.message;
                } else if (err.response?.data?.error) {
                    message = err.response.data.error;
                }
            }
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const handleChangePassword = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            setError('All password fields are required');
            return;
        }

        const passwordError = validatePasswordForCurrentEnv(newPassword, 'New password');
        if (passwordError) {
            setError(passwordError);
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('New passwords do not match');
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            await api.api.post('/auth/change-password', {
                currentPassword,
                newPassword,
            });
            setSuccess('Password changed successfully');
            setShowPasswordForm(false);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            // Logout user to force re-login with new password
            setTimeout(() => {
                logout();
                navigate('/login');
            }, 2000);
        } catch (err: unknown) {
            let message = 'Failed to change password';
            if (api.isAxiosError(err)) {
                if (err.response?.data?.message) {
                    message = err.response.data.message;
                } else if (err.response?.data?.error) {
                    message = err.response.data.error;
                }
            }
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateEmail = async () => {
        if (mustResetPassword) {
            setError('You must reset your password before changing your email');
            return;
        }
        if (!email.trim()) {
            setError('Email cannot be empty');
            return;
        }
        if (!emailCurrentPassword) {
            setError('Current password is required to change email');
            return;
        }

        setEmailLoading(true);
        setError('');
        setSuccess('');

        try {
            const response = await api.api.put<{
                user: { id: string; email: string; name: string; createdAt: string; updatedAt: string };
                accessToken: string;
                refreshToken: string;
            }>('/auth/email', {
                email: email.trim(),
                currentPassword: emailCurrentPassword,
            });

            localStorage.setItem(USER_KEY, JSON.stringify(response.data.user));

            setSuccess('Email updated successfully');
            setShowEmailForm(false);
            setEmailCurrentPassword('');

            setTimeout(() => window.location.reload(), 500);
        } catch (err: unknown) {
            let message = 'Failed to update email';
            if (api.isAxiosError(err)) {
                if (err.response?.data?.message) {
                    message = err.response.data.message;
                } else if (err.response?.data?.error) {
                    message = err.response.data.error;
                }
            }
            setError(message);
        } finally {
            setEmailLoading(false);
        }
    };

    return (
        <Layout
            collections={collections}
            selectedCollectionId="PROFILE"
            onSelectCollection={handleSelectCollection}
            onCreateCollection={handleCreateCollection}
            onEditCollection={handleEditCollection}
            onDeleteCollection={handleDeleteCollection}
        >
            <h1 className="text-3xl sm:text-5xl mb-6 sm:mb-8 text-slate-900 dark:text-white pl-1" style={{ fontFamily: 'Excalifont' }}>
                Profile
            </h1>

            {/* Success/Error Messages */}
            {success && (
                <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
                    <p className="text-green-800 dark:text-green-200 font-medium">{success}</p>
                </div>
            )}
            {error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl">
                    <p className="text-red-800 dark:text-red-200 font-medium">{error}</p>
                </div>
            )}

            <div className="space-y-6">
                {/* Personal Information Section */}
                <div className="bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 bg-indigo-50 dark:bg-neutral-800 rounded-xl flex items-center justify-center border-2 border-indigo-100 dark:border-neutral-700">
                            <User size={24} className="text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Personal Information</h2>
                    </div>

                            {mustResetPassword && (
                                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl">
                                    <p className="text-amber-900 dark:text-amber-200 font-bold">
                                        Password reset required
                                    </p>
                                    <p className="text-sm text-amber-800 dark:text-amber-200/80 font-medium mt-1">
                                        Change your password below before using ExcaliDash.
                                    </p>
                                </div>
                            )}
		                    <div className="space-y-4">
	                        <div>
	                            <label htmlFor="email" className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
	                                Email Address
	                            </label>
	                            <div className="flex gap-3">
	                                <input
	                                    id="email"
	                                    type="email"
	                                    value={email}
	                                    onChange={(e) => setEmail(e.target.value)}
	                                    disabled={!showEmailForm}
	                                    className={
	                                        showEmailForm
	                                            ? "flex-1 px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 font-medium"
	                                            : "flex-1 px-4 py-3 bg-slate-50 dark:bg-neutral-800 border-2 border-slate-200 dark:border-neutral-700 rounded-xl text-slate-600 dark:text-neutral-400 cursor-not-allowed"
	                                    }
	                                />
		                                {!showEmailForm && (
		                                    <button
		                                        onClick={() => {
		                                            setShowEmailForm(true);
		                                            setEmailCurrentPassword('');
		                                            setError('');
		                                            setSuccess('');
		                                        }}
                                                disabled={mustResetPassword}
		                                        className="px-6 py-3 bg-white dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200"
		                                    >
		                                        Change
		                                    </button>
		                                )}
	                            </div>

	                            {showEmailForm && (
	                                <div className="mt-4 space-y-3">
	                                    <div>
	                                        <label htmlFor="emailCurrentPassword" className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
	                                            Current Password
	                                        </label>
	                                        <input
	                                            id="emailCurrentPassword"
	                                            type="password"
	                                            value={emailCurrentPassword}
	                                            onChange={(e) => setEmailCurrentPassword(e.target.value)}
	                                            className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 font-medium"
	                                            placeholder="Enter current password"
	                                        />
	                                    </div>
	                                    <div className="flex gap-3">
	                                        <button
	                                            onClick={handleUpdateEmail}
	                                            disabled={
	                                                emailLoading ||
	                                                !email.trim() ||
	                                                !emailCurrentPassword ||
	                                                email.trim() === authUser?.email
	                                            }
	                                            className="flex-1 px-6 py-3 bg-indigo-600 dark:bg-indigo-500 text-white font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
	                                        >
	                                            {emailLoading ? 'Saving...' : 'Save Email'}
	                                        </button>
	                                        <button
	                                            onClick={() => {
	                                                setShowEmailForm(false);
	                                                setEmail(authUser?.email || '');
	                                                setEmailCurrentPassword('');
	                                                setError('');
	                                            }}
	                                            disabled={emailLoading}
	                                            className="px-6 py-3 bg-white dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
	                                        >
	                                            <X size={18} />
	                                            Cancel
	                                        </button>
	                                    </div>
	                                </div>
	                            )}
	                        </div>

                        <div>
                            <label htmlFor="name" className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
                                Display Name
                            </label>
                            <div className="flex gap-3">
                                <input
                                    id="name"
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="flex-1 px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 font-medium"
                                    placeholder="Your name"
                                />
	                                <button
	                                    onClick={handleUpdateName}
	                                    disabled={mustResetPassword || loading || !name.trim() || name === authUser?.name}
	                                    className="px-6 py-3 bg-indigo-600 dark:bg-indigo-500 text-white font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:disabled:hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] flex items-center gap-2"
	                                >
	                                    <Save size={18} />
	                                    Save
	                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Admin Settings */}
                {isAdmin && (
                    <div className="bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 bg-slate-50 dark:bg-neutral-800 rounded-xl flex items-center justify-center border-2 border-slate-200 dark:border-neutral-700">
                                <Shield size={24} className="text-slate-700 dark:text-neutral-200" />
                            </div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Admin Settings</h2>
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="text-slate-900 dark:text-white font-bold">User registration</p>
                                <p className="text-sm text-slate-600 dark:text-neutral-400">
                                    {registrationEnabled === null
                                        ? 'Loading…'
                                        : registrationEnabled
                                        ? 'New users can create accounts.'
                                        : 'Registration is disabled.'}
                                </p>
                            </div>
                            <button
                                onClick={handleToggleRegistration}
                                disabled={registrationLoading || registrationEnabled === null}
                                className="px-5 py-3 bg-slate-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-bold rounded-xl border-2 border-black dark:border-neutral-300 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:disabled:hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
                            >
                                {registrationLoading
                                    ? 'Saving…'
                                    : registrationEnabled
                                    ? 'Disable'
                                    : 'Enable'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Password Change Section */}
                <div className="bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-rose-50 dark:bg-neutral-800 rounded-xl flex items-center justify-center border-2 border-rose-100 dark:border-neutral-700">
                                <Lock size={24} className="text-rose-600 dark:text-rose-400" />
                            </div>
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Change Password</h2>
                        </div>
                        {!showPasswordForm && !mustResetPassword && (
                            <button
                                onClick={() => setShowPasswordForm(true)}
                                className="px-4 py-2 bg-rose-600 dark:bg-rose-500 text-white font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200"
                            >
                                Change Password
                            </button>
                        )}
                    </div>

                    {showPasswordForm && (
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="currentPassword" className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
                                    Current Password
                                </label>
                                <input
                                    id="currentPassword"
                                    type="password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 dark:focus:ring-rose-400 font-medium"
                                    placeholder="Enter current password"
                                />
                            </div>

                            <div>
                                <label htmlFor="newPassword" className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
                                    New Password
                                </label>
                                <input
                                    id="newPassword"
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 dark:focus:ring-rose-400 font-medium"
                                    placeholder={`Enter new password (${getPasswordRequirementsLabel()})`}
                                />
                            </div>

                            <div>
                                <label htmlFor="confirmPassword" className="block text-sm font-bold text-slate-700 dark:text-neutral-300 mb-2">
                                    Confirm New Password
                                </label>
                                <input
                                    id="confirmPassword"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full px-4 py-3 bg-white dark:bg-neutral-800 border-2 border-black dark:border-neutral-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 dark:focus:ring-rose-400 font-medium"
                                    placeholder="Confirm new password"
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={handleChangePassword}
                                    disabled={loading || !currentPassword || !newPassword || !confirmPassword}
                                    className="flex-1 px-6 py-3 bg-rose-600 dark:bg-rose-500 text-white font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:disabled:hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)]"
                                >
                                    {loading ? 'Changing...' : 'Change Password'}
                                </button>
                                    {!mustResetPassword && (
	                                    <button
	                                        onClick={() => {
	                                            setShowPasswordForm(false);
	                                            setCurrentPassword('');
	                                            setNewPassword('');
	                                            setConfirmPassword('');
	                                            setError('');
	                                        }}
	                                        disabled={loading}
	                                        className="px-6 py-3 bg-white dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 font-bold rounded-xl border-2 border-black dark:border-neutral-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:hover:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
	                                    >
	                                        <X size={18} />
	                                        Cancel
	                                    </button>
                                    )}
	                            </div>
	                        </div>
	                    )}
                </div>
            </div>
        </Layout>
    );
};
