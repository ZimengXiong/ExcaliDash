import React, { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  Link as LinkIcon,
  AlertTriangle,
  Check,
  RefreshCw,
} from "lucide-react";
import * as api from "../api";
import { useAuth } from "../context/AuthContext";
import { GeneralAccessSection } from "./share-modal/GeneralAccessSection";
import { SharePeopleSection } from "./share-modal/SharePeopleSection";
import { AgentAccessSection } from "./share-modal/AgentAccessSection";
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
  const [expiryOption, setExpiryOption] = useState("1h");
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
    setExpiryOption("1h");
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
    <>
      {/* Click-outside backdrop (completely transparent, no blur) */}
      <div
        className="fixed inset-0 z-[150] bg-transparent cursor-default"
        onClick={onClose}
      />

      {/* The popover container positioned under the share button */}
      <div className="absolute right-0 top-full mt-2 z-[160] flex max-h-[calc(100vh-5rem)] w-[460px] flex-col overflow-hidden rounded-2xl border-2 border-slate-800 bg-white font-sans shadow-[3px_3px_0px_0px_rgba(30,41,59,0.9)] animate-in fade-in slide-in-from-top-3 duration-200 dark:border-neutral-600 dark:bg-neutral-900 dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.18)]">
        {/* Content */}
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {error && (
            <div className="flex items-center gap-2.5 rounded-xl border-2 border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-600 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-400">
              <AlertTriangle size={16} strokeWidth={2} />
              {error}
            </div>
          )}

          <SharePeopleSection
            user={user}
            sharing={sharing}
            userQuery={userQuery}
            userPermission={userPermission}
            userResults={userResults}
            setUserQuery={setUserQuery}
            setUserPermission={setUserPermission}
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

          <AgentAccessSection drawingId={drawingId} isOpen={isOpen} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t-2 border-slate-100 px-4 py-3 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-900/50">
          <button
            onClick={() => handleCopy(currentLinkUrl)}
            disabled={!activeLink}
            className={clsx(
              "w-full py-2.5",
              isCopied
                ? "ui-button-success"
                : "ui-button-secondary",
              !activeLink && "cursor-not-allowed opacity-40 shadow-none",
            )}
          >
            {isCopied ? (
              <Check size={14} strokeWidth={2.5} />
            ) : (
              <LinkIcon size={14} strokeWidth={2.5} />
            )}
            {isCopied ? "Copied Link!" : "Copy Link"}
          </button>
        </div>

        {isLoading && (
          <div className="absolute inset-0 bg-white/20 dark:bg-black/10 backdrop-blur-[1px] flex items-center justify-center z-[300] pointer-events-none rounded-[14px]" role="status" aria-label="Updating sharing settings">
            <div className="ui-popover p-4">
              <RefreshCw
                size={24}
                strokeWidth={2.5}
                className="animate-spin text-indigo-600 dark:text-indigo-400"
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
};
