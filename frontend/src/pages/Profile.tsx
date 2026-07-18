import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import type { Collection } from '../types';
import { User, Save, X } from 'lucide-react';
import { displayFontFamily } from "../utils/displayFont";
import { ApiKeysCard } from "./profile/ApiKeysCard";
import { PasswordCard } from "./profile/PasswordCard";
import { getApiErrorMessage } from "../utils/getApiErrorMessage";

export const Profile: React.FC = () => {
    const { user: authUser, logout, authEnabled, updateUser } = useAuth();
    const navigate = useNavigate();
    const mustResetPassword = Boolean(authUser?.mustResetPassword);
    const [collections, setCollections] = useState<Collection[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [showEmailForm, setShowEmailForm] = useState(false);
    const [emailCurrentPassword, setEmailCurrentPassword] = useState('');
    const [emailLoading, setEmailLoading] = useState(false);



    useEffect(() => {
        if (authEnabled === false) {
            navigate('/settings', { replace: true });
            return;
        }
        const fetchData = async () => {
            try {
                const collectionsData = await api.getCollections();
                setCollections(collectionsData);
                
                if (authUser) {
                    setName(authUser.name);
                    setEmail(authUser.email);
                }
            } catch (err) {
                console.error('Failed to fetch data:', err);
            }
        };
        fetchData();
    }, [authEnabled, authUser, navigate]);





    const handleSelectCollection = (id: string | null | undefined) => {
        if (id === undefined) navigate('/');
        else if (id === null) navigate('/collections?id=unorganized');
        else navigate(`/collections?id=${id}`);
    };

    const handleCreateCollection = async (name: string) => {
        const collection = await api.createCollection(name);
        setCollections(prev => [...prev, collection]);
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
            if (response.data?.user) {
                updateUser(response.data.user);
            }
        } catch (err: unknown) {
            setError(getApiErrorMessage(err, 'Failed to update name'));
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
            }>('/auth/email', {
                email: email.trim(),
                currentPassword: emailCurrentPassword,
            });

            updateUser(response.data.user);

            setSuccess('Email updated successfully');
            setShowEmailForm(false);
            setEmailCurrentPassword('');

        } catch (err: unknown) {
            setError(getApiErrorMessage(err, 'Failed to update email'));
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
            <h1 className="text-3xl sm:text-5xl mb-6 sm:mb-8 text-slate-900 dark:text-white pl-1" style={{ fontFamily: displayFontFamily }}>
                Profile
            </h1>

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

                <ApiKeysCard disabled={mustResetPassword} onSuccess={setSuccess} />

                <PasswordCard
                    mustResetPassword={mustResetPassword}
                    logout={logout}
                    onError={setError}
                    onSuccess={setSuccess}
                />
            </div>
        </Layout>
    );
};
