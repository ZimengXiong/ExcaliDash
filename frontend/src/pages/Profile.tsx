import React, { useState, useEffect } from "react";
import { Layout } from "../components/Layout";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import * as api from "../api";
import type { Collection } from "../types";
import { User, Save } from "lucide-react";
import { displayFontFamily } from "../utils/displayFont";
import { PasswordCard } from "./profile/PasswordCard";
import { getApiErrorMessage } from "../utils/getApiErrorMessage";
import {
  SettingsCard,
  SettingsRow,
  SettingsSectionHeader,
  settingsButtonClass,
  settingsPrimaryButtonClass,
  settingsSelectClass,
} from "./settings/SettingsRow";

export const Profile: React.FC = () => {
  const { user: authUser, logout, authEnabled, authMode, updateUser } =
    useAuth();
  const navigate = useNavigate();
  const mustResetPassword = Boolean(authUser?.mustResetPassword);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailCurrentPassword, setEmailCurrentPassword] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const collectionsData = await api.getCollections();
        setCollections(collectionsData);

        if (authUser) {
          setName(authUser.name);
          setEmail(authUser.email);
        }
      } catch (err) {
        console.error("Failed to fetch data:", err);
      }
    };
    fetchData();
  }, [authEnabled, authUser, navigate]);

  const handleSelectCollection = (id: string | null | undefined) => {
    if (id === undefined) navigate("/");
    else if (id === null) navigate("/collections?id=unorganized");
    else navigate(`/collections?id=${id}`);
  };

  const handleCreateCollection = async (name: string) => {
    const collection = await api.createCollection(name);
    setCollections((prev) => [...prev, collection]);
  };

  const handleEditCollection = async (id: string, name: string) => {
    setCollections((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name } : c)),
    );
    await api.updateCollection(id, name);
  };

  const handleDeleteCollection = async (id: string) => {
    setCollections((prev) => prev.filter((c) => c.id !== id));
    await api.deleteCollection(id);
  };

  const handleUpdateName = async () => {
    if (mustResetPassword) {
      setError("You must reset your password before updating your profile");
      return;
    }
    if (!name.trim()) {
      setError("Name cannot be empty");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await api.api.put<{
        user: {
          id: string;
          email: string;
          name: string;
          createdAt: string;
          updatedAt: string;
        };
      }>("/auth/profile", { name: name.trim() });
      setSuccess("Name updated successfully");
      if (response.data?.user) {
        updateUser(response.data.user);
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to update name"));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateEmail = async () => {
    if (mustResetPassword) {
      setError("You must reset your password before changing your email");
      return;
    }
    if (!email.trim()) {
      setError("Email cannot be empty");
      return;
    }
    if (!emailCurrentPassword) {
      setError("Current password is required to change email");
      return;
    }

    setEmailLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await api.api.put<{
        user: {
          id: string;
          email: string;
          name: string;
          createdAt: string;
          updatedAt: string;
        };
      }>("/auth/email", {
        email: email.trim(),
        currentPassword: emailCurrentPassword,
      });

      updateUser(response.data.user);

      setSuccess("Email updated successfully");
      setShowEmailForm(false);
      setEmailCurrentPassword("");
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to update email"));
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
      <div className="mx-auto w-full max-w-3xl">
        <h1
          className="text-3xl sm:text-5xl mb-6 sm:mb-8 text-slate-900 dark:text-white pl-1"
          style={{ fontFamily: displayFontFamily }}
        >
          Profile
        </h1>

      {success && (
        <div className="mb-4 p-3.5 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
          <p className="text-green-800 dark:text-green-200 font-medium">
            {success}
          </p>
        </div>
      )}
      {error && (
        <div className="mb-4 p-3.5 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl">
          <p className="text-red-800 dark:text-red-200 font-medium">{error}</p>
        </div>
      )}

      <div className="space-y-6">
        {authEnabled ? (
          <section>
            <SettingsSectionHeader
              icon={<User size={20} />}
              tileClassName="border-black bg-indigo-400 text-black dark:border-neutral-700 dark:bg-indigo-400 dark:text-black"
              title="Personal information"
              subtitle="How you appear to others"
            />

            {mustResetPassword && (
              <div className="mb-3 p-3.5 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl">
                <p className="text-amber-900 dark:text-amber-200 font-bold">
                  Password reset required
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-200/80 font-medium mt-0.5">
                  Change your password below before using ExcaliDash.
                </p>
              </div>
            )}

            <SettingsCard>
              <div className="px-4 py-3.5 sm:px-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1 basis-40">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white sm:text-base">
                      Email
                    </h3>
                    <p className="mt-0.5 truncate text-xs font-medium text-slate-500 dark:text-neutral-400">
                      {email}
                    </p>
                  </div>
                  {!showEmailForm && (
                    <button
                      onClick={() => {
                        setShowEmailForm(true);
                        setEmailCurrentPassword("");
                        setError("");
                        setSuccess("");
                      }}
                      disabled={mustResetPassword}
                      className={`${settingsButtonClass} ml-auto`}
                    >
                      Change
                    </button>
                  )}
                </div>

                {showEmailForm && (
                  <div className="mt-3 max-w-md space-y-3">
                    <div>
                      <label
                        htmlFor="email"
                        className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-neutral-400"
                      >
                        New email
                      </label>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={`${settingsSelectClass} w-full`}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="emailCurrentPassword"
                        className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-neutral-400"
                      >
                        Current password
                      </label>
                      <input
                        id="emailCurrentPassword"
                        type="password"
                        value={emailCurrentPassword}
                        onChange={(e) =>
                          setEmailCurrentPassword(e.target.value)
                        }
                        className={`${settingsSelectClass} w-full`}
                        placeholder="Enter current password"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleUpdateEmail}
                        disabled={
                          emailLoading ||
                          !email.trim() ||
                          !emailCurrentPassword ||
                          email.trim() === authUser?.email
                        }
                        className={settingsPrimaryButtonClass}
                      >
                        {emailLoading ? "Saving…" : "Save email"}
                      </button>
                      <button
                        onClick={() => {
                          setShowEmailForm(false);
                          setEmail(authUser?.email || "");
                          setEmailCurrentPassword("");
                          setError("");
                        }}
                        disabled={emailLoading}
                        className={settingsButtonClass}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <SettingsRow title="Display name" description="Shown to collaborators">
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`${settingsSelectClass} w-48`}
                  placeholder="Your name"
                />
                <button
                  onClick={handleUpdateName}
                  disabled={
                    mustResetPassword ||
                    loading ||
                    !name.trim() ||
                    name === authUser?.name
                  }
                  className={`${settingsPrimaryButtonClass} inline-flex items-center gap-1.5`}
                >
                  <Save size={14} />
                  Save
                </button>
              </SettingsRow>
            </SettingsCard>
          </section>
        ) : null}

        {authEnabled && authMode !== "oidc_enforced" ? (
          <PasswordCard
            mustResetPassword={mustResetPassword}
            logout={logout}
            onError={setError}
            onSuccess={setSuccess}
          />
        ) : null}
      </div>
      </div>
    </Layout>
  );
};
