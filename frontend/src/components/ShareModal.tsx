import React, { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  X,
  Link as LinkIcon,
  AlertTriangle,
  Check,
  RefreshCw,
} from "lucide-react";
import * as api from "../api";
import { useAuth } from "../context/AuthContext";
import { GeneralAccessSection } from "./share-modal/GeneralAccessSection";
import { SharePeopleSection } from "./share-modal/SharePeopleSection";
import {
  calculateExpiresAt,
  DEFAULT_EDIT_EXPIRY_OPTION,
  toDatetimeLocalFromIso,
} from "./share-modal/shareUtils";

type Props = {
  drawingId: string;
  drawingName: string;
  isOpen: boolean;
  onClose: () => void;
};

export const ShareModal: React.FC<Props> = ({
  drawingId,
  drawingName,
  isOpen,
  onClose,
}) => {
  const { user } = useAuth();
  const currentUserId = user?.id || null;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState<{
    permissions: api.DrawingPermissionRow[];
    linkShares: api.DrawingLinkShareRow[];
  } | null>(null);

  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<api.ShareResolvedUser[]>([]);
  const [userPermission, setUserPermission] = useState<"view" | "edit">("view");
  const [linkPermission, setLinkPermission] = useState<"view" | "edit">("view");
  const [expiryOption, setExpiryOption] = useState("1d");
  const [customExpiry, setCustomExpiry] = useState("");
  const [isCopied, setIsCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareableEditorUrl = `${origin}/shared/${drawingId}`;

  const activeLink = useMemo(() => {
    const now = Date.now();
    return (
      (sharing?.linkShares || []).find((s) => {
        if (s.revokedAt) return false;
        if (!s.expiresAt) return true;
        const ts = Date.parse(String(s.expiresAt));
        if (!Number.isFinite(ts)) return false;
        return ts > now;
      }) || null
    );
  }, [sharing]);

  useEffect(() => {
    if (!isOpen) return;
    if (!activeLink) return;
    setLinkPermission(activeLink.permission);
    if (activeLink.expiresAt) {
      setExpiryOption("custom");
      setCustomExpiry(toDatetimeLocalFromIso(activeLink.expiresAt));
    } else {
      setExpiryOption("never");
      setCustomExpiry("");
    }
  }, [activeLink, isOpen]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getDrawingSharing(drawingId);
      setSharing(data);
    } catch (err: unknown) {
      let message = "Failed to load sharing settings";
      if (api.isAxiosError(err)) {
        const serverMessage =
          typeof err.response?.data?.message === "string"
            ? err.response.data.message
            : null;
        if (serverMessage) message = serverMessage;
      }
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [drawingId]);

  useEffect(() => {
    if (!isOpen) return;
    setUserQuery("");
    setUserResults([]);
    setUserPermission("view");
    setLinkPermission("view");
    setExpiryOption("1d");
    setCustomExpiry("");
    setIsCopied(false);
    void refresh();
  }, [isOpen, refresh]);

  useEffect(() => {
    if (!isOpen) return;
    const q = userQuery.trim();
    if (q.length < 3) {
      setUserResults([]);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const users = await api.resolveShareUsers(drawingId, q);
        const filtered = currentUserId
          ? users.filter((u) => u.id !== currentUserId)
          : users;
        if (!cancelled) setUserResults(filtered);
      } catch {
        if (!cancelled) setUserResults([]);
      }
    };
    const t = window.setTimeout(run, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [currentUserId, drawingId, isOpen, userQuery]);

  const handleCopy = async (text: string) => {
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser; sharing still works via visible link text.
    }
  };

  const handleAddUser = async (uId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await api.upsertDrawingPermission(drawingId, {
        granteeUserId: uId,
        permission: userPermission,
      });
      await refresh();
      setUserQuery("");
      setUserResults([]);
    } catch (err: unknown) {
      let message = "Failed to share with user";
      if (api.isAxiosError(err)) {
        const serverMessage =
          typeof err.response?.data?.message === "string"
            ? err.response.data.message
            : null;
        if (serverMessage) message = serverMessage;
      }
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeUser = async (permissionId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await api.revokeDrawingPermission(drawingId, permissionId);
      await refresh();
    } catch {
      setError("Failed to revoke access");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateUserPermission = async (
    granteeUserId: string,
    permission: "view" | "edit",
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      await api.upsertDrawingPermission(drawingId, {
        granteeUserId,
        permission,
      });
      await refresh();
    } catch (err: unknown) {
      let message = "Failed to update access";
      if (api.isAxiosError(err)) {
        const serverMessage =
          typeof err.response?.data?.message === "string"
            ? err.response.data.message
            : null;
        if (serverMessage) message = serverMessage;
      }
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateLink = async (
    newPermission?: "view" | "edit",
    newExpiry?: string | null,
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      if (activeLink) {
        await api.revokeLinkShare(drawingId, activeLink.id);
      }
      const perm = newPermission ?? linkPermission;
      setLinkPermission(perm);
      let expiresAt =
        newExpiry !== undefined
          ? newExpiry
          : calculateExpiresAt(expiryOption, customExpiry);
      if (perm === "edit" && expiresAt === null) {
        expiresAt = calculateExpiresAt(DEFAULT_EDIT_EXPIRY_OPTION);
        setExpiryOption(DEFAULT_EDIT_EXPIRY_OPTION);
      }
      await api.createLinkShare(drawingId, { permission: perm, expiresAt });
      await refresh();
      void handleCopy(shareableEditorUrl);
    } catch (err: unknown) {
      let message = "Failed to update link";
      if (api.isAxiosError(err)) {
        const serverMessage =
          typeof err.response?.data?.message === "string"
            ? err.response.data.message
            : null;
        if (serverMessage) message = serverMessage;
      }
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeLink = async () => {
    if (!activeLink) return;
    setIsLoading(true);
    setError(null);
    try {
      await api.revokeLinkShare(drawingId, activeLink.id);
      await refresh();
    } catch {
      setError("Failed to revoke link");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;
  const currentLinkUrl = activeLink ? shareableEditorUrl : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-neutral-900/20 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-[420px] bg-white dark:bg-neutral-900 rounded-2xl border-2 border-black dark:border-neutral-700 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.08)] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b-2 border-black dark:border-neutral-700">
          <h2
            className="text-base font-bold text-slate-800 dark:text-neutral-100 truncate pr-4"
            title={drawingName}
          >
            Share "{drawingName}"
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-950 dark:hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 px-6 py-5 space-y-5 overflow-visible">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-3">
              <AlertTriangle size={16} strokeWidth={2} />
              {error}
            </div>
          )}

          <SharePeopleSection
            user={user}
            sharing={sharing}
            userQuery={userQuery}
            userResults={userResults}
            setUserQuery={setUserQuery}
            handleAddUser={handleAddUser}
            handleRevokeUser={handleRevokeUser}
            handleUpdateUserPermission={handleUpdateUserPermission}
          />

          <GeneralAccessSection
            activeLink={activeLink}
            linkPermission={linkPermission}
            expiryOption={expiryOption}
            customExpiry={customExpiry}
            setLinkPermission={setLinkPermission}
            setExpiryOption={setExpiryOption}
            setCustomExpiry={setCustomExpiry}
            handleUpdateLink={handleUpdateLink}
            handleRevokeLink={handleRevokeLink}
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-between border-t-2 border-black dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800/50 rounded-b-[14px]">
          <button
            onClick={() => handleCopy(currentLinkUrl)}
            disabled={!activeLink}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-xl border-2 font-bold text-xs transition-all active:translate-x-[1px] active:translate-y-[1px]",
              isCopied
                ? "bg-emerald-500 text-white border-black shadow-none translate-x-[1px] translate-y-[1px]"
                : "bg-white dark:bg-neutral-900 border-black dark:border-neutral-600 text-indigo-600 dark:text-indigo-400 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.05)] hover:-translate-y-0.5",
              !activeLink &&
                "opacity-40 grayscale cursor-not-allowed shadow-none",
            )}
          >
            {isCopied ? (
              <Check size={14} strokeWidth={2.5} />
            ) : (
              <LinkIcon size={14} strokeWidth={2.5} />
            )}
            {isCopied ? "Copied" : "Copy Link"}
          </button>

          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-indigo-600 dark:bg-indigo-500 text-white border-2 border-black font-bold text-xs hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-0 active:shadow-none transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
          >
            Done
          </button>
        </div>

        {isLoading && (
          <div className="absolute inset-0 bg-white/20 dark:bg-black/10 backdrop-blur-[1px] flex items-center justify-center z-[300] pointer-events-none rounded-[14px]">
            <div className="bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 p-4 rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
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
