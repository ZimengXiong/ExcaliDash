import React, { useCallback, useEffect, useState } from "react";
import { X, Plus, AlertTriangle, RefreshCw, Search, Users } from "lucide-react";
import * as api from "../api";
import type {
  CollectionShareRow,
  CollectionShareRole,
  CollectionShareUser,
} from "../types";
import { useAuth } from "../context/AuthContext";
import { RoleSelect } from "./RoleSelect";
import { UserAvatar } from "./UserAvatar";

type Props = {
  collectionId: string;
  collectionName: string;
  isOpen: boolean;
  onClose: () => void;
};

export const ShareCollectionModal: React.FC<Props> = ({
  collectionId,
  collectionName,
  isOpen,
  onClose,
}) => {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shares, setShares] = useState<CollectionShareRow[]>([]);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CollectionShareUser[]>([]);
  const [addRole, setAddRole] = useState<CollectionShareRole>("view");

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getCollectionShares(collectionId);
      setShares(data.shares);
    } catch (err: unknown) {
      let msg = "Failed to load sharing settings";
      if (api.isAxiosError(err)) {
        const s = err.response?.data?.message;
        if (typeof s === "string") msg = s;
      }
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [collectionId]);

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setResults([]);
    setAddRole("view");
    setError(null);
    void refresh();
  }, [isOpen, refresh]);

  // Debounced user search
  useEffect(() => {
    if (!isOpen) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const users = await api.resolveCollectionShareUsers(collectionId, q);
        if (!cancelled) setResults(users);
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, collectionId, isOpen]);

  const handleAdd = async (u: CollectionShareUser) => {
    setIsLoading(true);
    setError(null);
    try {
      await api.addCollectionShare(collectionId, u.email, addRole);
      await refresh();
      setQuery("");
      setResults([]);
    } catch (err: unknown) {
      let msg = "Failed to share with user";
      if (api.isAxiosError(err)) {
        const s = err.response?.data?.message ?? err.response?.data?.error;
        if (typeof s === "string") msg = s;
      }
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, val: string) => {
    if (val === "remove") {
      await handleRemove(userId);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await api.updateCollectionShare(
        collectionId,
        userId,
        val as CollectionShareRole,
      );
      await refresh();
    } catch {
      setError("Failed to update role");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = async (userId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await api.removeCollectionShare(collectionId, userId);
      await refresh();
    } catch {
      setError("Failed to remove user");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-neutral-900/20 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-[500px] bg-white dark:bg-neutral-900 rounded-2xl border-2 border-slate-800 dark:border-neutral-700 shadow-[3px_3px_0px_0px_rgba(30,41,59,0.9)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.18)] flex flex-col animate-in fade-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b-2 border-slate-800 dark:border-neutral-700">
          <h2
            className="text-base font-bold text-slate-800 dark:text-neutral-100 truncate pr-4"
            title={collectionName}
          >
            Share "{collectionName}"
          </h2>
          <button
            onClick={onClose}
            className="ui-icon-button h-8 w-8 border-transparent bg-transparent shadow-none dark:bg-transparent"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 px-6 py-5 space-y-6 overflow-visible">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-3">
              <AlertTriangle size={16} strokeWidth={2} />
              {error}
            </div>
          )}

          {/* Search + role selector */}
          <section className="relative">
            <div className="flex gap-2 items-center">
              <div className="relative flex-1 group">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors">
                  <Search size={16} strokeWidth={2} />
                </div>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Add people by name or email"
                  className="w-full pl-10 pr-4 py-2 rounded-xl border-2 border-slate-800 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-neutral-100 focus:outline-none focus:border-indigo-600 dark:focus:border-indigo-500 transition-all text-sm font-semibold placeholder:text-slate-400 shadow-[1.5px_1.5px_0px_0px_rgba(30,41,59,0.9)] dark:shadow-[1.5px_1.5px_0px_0px_rgba(255,255,255,0.18)]"
                />
              </div>
              {/* Role picker for new additions */}
              <div className="shrink-0 border-2 border-slate-800 dark:border-neutral-700 rounded-xl px-1 bg-white dark:bg-neutral-900 shadow-[1.5px_1.5px_0px_0px_rgba(30,41,59,0.9)] dark:shadow-[1.5px_1.5px_0px_0px_rgba(255,255,255,0.18)]">
                <RoleSelect
                  value={addRole}
                  onChange={(v) => setAddRole(v as CollectionShareRole)}
                />
              </div>
            </div>

            {results.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 border-2 border-slate-800 dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-900 shadow-[3px_3px_0px_0px_rgba(30,41,59,0.9)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.18)] overflow-hidden z-[200] animate-in fade-in slide-in-from-top-2">
                {results.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleAdd(u)}
                    className="ui-menu-item gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0 dark:border-neutral-800"
                  >
                    <UserAvatar name={u.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-neutral-100 truncate">
                        {u.name}
                      </div>
                      <div className="text-[10px] font-semibold text-slate-500 dark:text-neutral-400 truncate">
                        {u.email}
                      </div>
                    </div>
                    <Plus
                      size={16}
                      className="text-slate-400 group-hover:text-indigo-600 transition-colors"
                      strokeWidth={2}
                    />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* People with access */}
          <section className="space-y-2">
            <h3 className="text-xs font-bold text-neutral-500 dark:text-neutral-400 px-1">
              People with access
            </h3>

            <div className="space-y-0.5">
              {/* Owner row */}
              <div className="flex items-center gap-3 px-1 py-1.5 min-h-[48px]">
                <UserAvatar name={user?.name || "User"} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-neutral-100 leading-tight">
                    {user?.name}{" "}
                    <span className="text-slate-400 dark:text-neutral-500 font-semibold ml-1">
                      (you)
                    </span>
                  </div>
                  <div className="text-[10px] font-semibold text-slate-500 dark:text-neutral-400 mt-0.5">
                    {user?.email}
                  </div>
                </div>
                <div className="text-xs font-semibold text-neutral-400 dark:text-neutral-500 pr-4 shrink-0">
                  Owner
                </div>
              </div>

              {shares.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-6 text-slate-400 dark:text-neutral-500">
                  <Users size={28} strokeWidth={1.5} />
                  <p className="text-xs font-bold">
                    No one else has access yet
                  </p>
                </div>
              )}

              {shares.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 px-1 py-1.5 min-h-[48px] group"
                >
                  <UserAvatar name={s.granteeUser.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-neutral-100 leading-tight truncate">
                      {s.granteeUser.name}
                    </div>
                    <div className="text-[10px] font-semibold text-slate-500 dark:text-neutral-400 mt-0.5 truncate">
                      {s.granteeUser.email}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <RoleSelect
                      value={s.role}
                      onChange={(val) => handleRoleChange(s.granteeUserId, val)}
                      extraOptions={[
                        {
                          label: "Remove access",
                          value: "remove",
                          danger: true,
                        },
                      ]}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-end border-t-2 border-slate-800 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800/50 rounded-b-[14px]">
          <button
            onClick={onClose}
            className="ui-button-primary px-6 text-xs"
          >
            Done
          </button>
        </div>

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-white/20 dark:bg-black/10 backdrop-blur-[1px] flex items-center justify-center z-[300] pointer-events-none rounded-[14px]">
            <div className="bg-white dark:bg-neutral-900 border-2 border-slate-800 dark:border-neutral-700 p-4 rounded-2xl shadow-[3px_3px_0px_0px_rgba(30,41,59,0.9)]">
              <RefreshCw
                size={24}
                strokeWidth={2.5}
                className="animate-spin text-indigo-600 dark:text-indigo-400"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
