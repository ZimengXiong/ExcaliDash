import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import clsx from "clsx";
import {
  X,
  Plus,
  Link as LinkIcon,
  AlertTriangle,
  Globe,
  Lock,
  ChevronDown,
  Calendar,
  Shield,
  Check,
  RefreshCw,
  Search,
} from "lucide-react";
import * as api from "../api";
import { useAuth } from "../context/AuthContext";

type Props = {
  drawingId: string;
  drawingName: string;
  isOpen: boolean;
  onClose: () => void;
};

const toIsoFromDatetimeLocal = (value: string): string | undefined => {
  const trimmed = (value || "").trim();
  if (!trimmed) return undefined;
  const date = new Date(trimmed);
  if (!Number.isFinite(date.getTime())) return undefined;
  return date.toISOString();
};

const EXPIRY_OPTIONS = [
  { label: "Disable in 1 hour", value: "1h" },
  { label: "Disable in 1 day", value: "1d" },
  { label: "Disable in 2 days", value: "2d" },
  { label: "Disable in 7 days", value: "7d" },
  { label: "Disable in 30 days", value: "30d" },
  { label: "Never auto-disable", value: "never" },
  { label: "Disable at...", value: "custom" },
];

const calculateExpiresAt = (option: string, customDate?: string): string | undefined => {
  if (option === "never") return undefined;
  if (option === "custom") return toIsoFromDatetimeLocal(customDate || "");

  const now = new Date();
  switch (option) {
    case "1h": now.setHours(now.getHours() + 1); break;
    case "1d": now.setDate(now.getDate() + 1); break;
    case "2d": now.setDate(now.getDate() + 2); break;
    case "7d": now.setDate(now.getDate() + 7); break;
    case "30d": now.setDate(now.getDate() + 30); break;
    default: return undefined;
  }
  return now.toISOString();
};

const CustomSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string; danger?: boolean }[];
  className?: string;
  icon?: React.ReactNode;
  align?: "left" | "right";
  showCheck?: boolean;
  variant?: "ghost" | "bordered";
}> = ({ value, onChange, options, className, icon, align = "left", showCheck = true, variant = "ghost" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const currentOption = options.find(o => o.value === value) || options[0];

  return (
    <div className={clsx("relative inline-flex items-center", className)} ref={containerRef}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={clsx(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all text-sm font-bold outline-none",
          variant === "bordered" 
            ? "border-2 border-black dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.05)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            : "hover:bg-gray-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-neutral-300"
        )}
      >
        {icon}
        <span>{currentOption.label}</span>
        <ChevronDown size={14} className={clsx("transition-transform duration-200", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className={clsx(
          "absolute top-full z-[100] mt-1.5 min-w-[140px] bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 rounded-xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.1)] overflow-hidden animate-in fade-in zoom-in-95 duration-100",
          align === "right" ? "right-0" : "left-0"
        )}>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={clsx(
                "w-full text-left px-3 py-2 text-xs font-bold transition-colors flex items-center justify-between border-b last:border-b-0 border-slate-100 dark:border-neutral-800",
                opt.value === value && showCheck
                  ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400" 
                  : opt.danger
                    ? "text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                    : "text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800"
              )}
            >
              {opt.label}
              {opt.value === value && showCheck && <Check size={12} strokeWidth={3} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const ShareModal: React.FC<Props> = ({ drawingId, drawingName, isOpen, onClose }) => {
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

  const formatAutoDisableText = (expiresAt: string | null): string => {
    if (!expiresAt) return "External access does not auto-disable.";
    const ts = Date.parse(String(expiresAt));
    if (!Number.isFinite(ts)) return "External access will auto-disable.";
    return `External access auto-disables on ${new Date(ts).toLocaleString()}.`;
  };

  // Keep the permission dropdown aligned with the actual active link policy from the server.
  useEffect(() => {
    if (!isOpen) return;
    if (!activeLink) return;
    setLinkPermission(activeLink.permission);
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
        const serverMessage = typeof err.response?.data?.message === "string" ? err.response.data.message : null;
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
        const filtered = currentUserId ? users.filter((u) => u.id !== currentUserId) : users;
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
      // Clipboard may be unavailable (permission denied / insecure context).
    }
  };

  const handleAddUser = async (uId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await api.upsertDrawingPermission(drawingId, { granteeUserId: uId, permission: userPermission });
      await refresh();
      setUserQuery("");
      setUserResults([]);
    } catch (err: unknown) {
      let message = "Failed to share with user";
      if (api.isAxiosError(err)) {
        const serverMessage = typeof err.response?.data?.message === "string" ? err.response.data.message : null;
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

  const handleUpdateLink = async (newPermission?: "view" | "edit", newExpiry?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      if (activeLink) {
        await api.revokeLinkShare(drawingId, activeLink.id);
      }
      
      const perm = newPermission ?? linkPermission;
      setLinkPermission(perm);
      const expiresAt = newExpiry ?? calculateExpiresAt(expiryOption, customExpiry);
      
      await api.createLinkShare(drawingId, {
        permission: perm,
        expiresAt,
      });

      await refresh();
      void handleCopy(shareableEditorUrl);
    } catch (err: unknown) {
      let message = "Failed to update link";
      if (api.isAxiosError(err)) {
        const serverMessage = typeof err.response?.data?.message === "string" ? err.response.data.message : null;
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
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-[420px] bg-white dark:bg-neutral-900 rounded-[20px] border-2 border-black dark:border-neutral-700 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.05)] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="px-5 py-3.5 flex items-center justify-between border-b-2 border-black dark:border-neutral-700">
          <h2 className="text-base font-black text-slate-800 dark:text-neutral-100 truncate pr-4" title={drawingName}>
            Share "{drawingName}"
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border-2 border-transparent hover:border-black dark:hover:border-neutral-600 transition-all group shrink-0"
          >
            <X size={16} strokeWidth={3} className="group-hover:rotate-90 transition-transform duration-200" />
          </button>
        </div>

        <div className="flex-1 px-5 py-5 space-y-5 overflow-visible">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border-2 border-rose-600 dark:border-rose-500 text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-3">
              <AlertTriangle size={16} strokeWidth={3} />
              {error}
            </div>
          )}

          <section className="relative">
            <div className="relative group">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors">
                <Search size={16} strokeWidth={2.5} />
              </div>
              <input
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="Add people"
                className="w-full pl-10 pr-4 py-2 rounded-xl border-2 border-black dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-0 focus:border-indigo-600 dark:focus:border-indigo-500 transition-all text-sm font-bold placeholder:text-slate-400 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.05)]"
              />
            </div>

            {userResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 border-2 border-black dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.1)] overflow-hidden z-[200] animate-in fade-in slide-in-from-top-2">
                {userResults.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleAddUser(u.id)}
                    className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors group border-b last:border-b-0 border-slate-100 dark:border-neutral-800"
                  >
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-black text-xs border-2 border-black dark:border-neutral-600">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-black text-slate-900 dark:text-neutral-100 truncate">{u.name}</div>
                      <div className="text-[10px] font-bold text-slate-500 dark:text-neutral-400 truncate">{u.email}</div>
                    </div>
                    <Plus size={16} className="text-slate-400 group-hover:text-indigo-600 transition-colors" strokeWidth={3} />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-neutral-500 px-1">People with access</h3>
            
            <div className="space-y-0">
              <div className="flex items-center gap-3 px-1 py-1.5">
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-neutral-800 flex items-center justify-center text-slate-600 dark:text-neutral-300 font-black text-sm border-2 border-black dark:border-neutral-600 shrink-0">
                  {user?.name?.charAt(0).toUpperCase() || "U"}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <div className="text-xs font-black text-slate-900 dark:text-neutral-100 leading-tight">
                    {user?.name} <span className="text-slate-400 dark:text-neutral-500 font-bold ml-1">(you)</span>
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 dark:text-neutral-400 mt-0.5">{user?.email}</div>
                </div>
                <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 dark:text-neutral-500 pr-1 shrink-0">Owner</div>
              </div>

              {(sharing?.permissions || []).map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-1 py-1.5 group">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-black text-sm border-2 border-indigo-600 dark:border-indigo-500 shrink-0">
                    {p.granteeUser.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="text-xs font-black text-slate-900 dark:text-neutral-100 leading-tight truncate">{p.granteeUser.name}</div>
                    <div className="text-[10px] font-bold text-slate-500 dark:text-neutral-400 mt-0.5 truncate">{p.granteeUser.email}</div>
                  </div>
                  <div className="shrink-0 flex items-center h-full">
                    <CustomSelect
                      value={p.permission}
                      onChange={async (val) => {
                        if (val === "remove") {
                          await handleRevokeUser(p.id);
                        } else {
                          await api.upsertDrawingPermission(drawingId, { granteeUserId: p.granteeUserId, permission: val as any });
                          void refresh();
                        }
                      }}
                      options={[
                        { label: "Viewer", value: "view" },
                        { label: "Editor", value: "edit" },
                        { label: "Remove access", value: "remove", danger: true },
                      ]}
                      align="right"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="pt-5 border-t-2 border-black dark:border-neutral-700">
            <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-neutral-500 px-1 mb-3">General access</h3>
            
            <div className="flex items-start gap-4 px-1">
              <div className={clsx(
                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border-2 transition-all mt-0.5",
                activeLink 
                  ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-600 dark:border-emerald-500 shadow-[2px_2px_0px_0px_rgba(5,150,105,0.2)]" 
                  : "bg-slate-50 dark:bg-neutral-800 text-slate-400 dark:text-neutral-500 border-slate-400 dark:border-neutral-600"
              )}>
                {activeLink ? <Globe size={18} strokeWidth={3} /> : <Lock size={18} strokeWidth={3} />}
              </div>
              
              <div className="flex-1 min-w-0 flex flex-col gap-0">
                <div className="flex items-center gap-1">
                  <CustomSelect
                    value={activeLink ? "anyone" : "restricted"}
                    onChange={(val) => {
                      if (val === "anyone") void handleUpdateLink();
                      else void handleRevokeLink();
                    }}
                    options={[
                      { label: "Restricted", value: "restricted" },
                      { label: "Anyone with the link", value: "anyone" },
                    ]}
                    className="-ml-2.5"
                    showCheck={false}
                  />
                </div>
                
                <p className="text-[11px] font-bold text-slate-500 dark:text-neutral-400 leading-snug px-0.5">
                  {activeLink 
                    ? "Anyone on the internet with the link can access." 
                    : "Only people with access can open with the link."}
                </p>

                {activeLink && (
                  <div className="pt-3.5 space-y-3.5 animate-in fade-in slide-in-from-top-1 duration-200">
                    <p className="text-[9px] font-black text-slate-500 dark:text-neutral-400 px-0.5">
                      {formatAutoDisableText(activeLink.expiresAt)}
                      {" "}When it disables, General access switches back to Restricted.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <CustomSelect
                        value={linkPermission}
                        onChange={(val) => handleUpdateLink(val as any)}
                        options={[
                          { label: "Viewer", value: "view" },
                          { label: "Editor", value: "edit" },
                        ]}
                        icon={<Shield size={12} strokeWidth={2.5} className="text-slate-400" />}
                        variant="bordered"
                      />

                      <CustomSelect
                        value={expiryOption}
                        onChange={(val) => {
                          setExpiryOption(val);
                          if (val !== "custom") {
                            const nextExpiry = calculateExpiresAt(val);
                            void handleUpdateLink(undefined, nextExpiry);
                          }
                        }}
                        options={EXPIRY_OPTIONS}
                        icon={<Calendar size={12} strokeWidth={2.5} className="text-slate-400" />}
                        variant="bordered"
                      />
                    </div>

                    {expiryOption === "custom" && (
                      <input
                        type="datetime-local"
                        value={customExpiry}
                        onChange={(e) => setCustomExpiry(e.target.value)}
                        onBlur={() => void handleUpdateLink()}
                        className="w-full px-3 py-1.5 rounded-xl border-2 border-black dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800 text-[10px] font-black focus:outline-none focus:border-indigo-600 transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.05)]"
                      />
                    )}

                    {linkPermission === "edit" && (
                      <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border-2 border-amber-500 space-y-1.5 shadow-[2px_2px_0px_0px_rgba(245,158,11,0.2)]">
                        <div className="flex items-start gap-2">
                           <AlertTriangle size={14} strokeWidth={3} className="text-amber-600 shrink-0 mt-0.5" />
                           <div className="text-[10px] text-amber-900 dark:text-amber-200 font-black leading-relaxed">
                             <span className="uppercase tracking-[0.1em] text-[8px]">Security Warning</span><br/>
                             Edit access via link is sensitive.
                           </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        <div className="px-5 py-5 flex items-center justify-between border-t-2 border-black dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800/50 rounded-b-[18px]">
          <button
            onClick={() => handleCopy(currentLinkUrl)}
            disabled={!activeLink}
            className={clsx(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 font-black text-[10px] uppercase tracking-widest transition-all active:translate-x-[1px] active:translate-y-[1px]",
              isCopied 
                ? "bg-emerald-500 text-white border-black shadow-none translate-x-[1px] translate-y-[1px]" 
                : "bg-white dark:bg-neutral-900 border-black dark:border-neutral-600 text-indigo-600 dark:text-indigo-400 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.05)] hover:-translate-y-0.5",
              !activeLink && "opacity-40 grayscale cursor-not-allowed shadow-none"
            )}
          >
            {isCopied ? <Check size={16} strokeWidth={3} /> : <LinkIcon size={16} strokeWidth={3} />}
            {isCopied ? "COPIED!" : "COPY LINK"}
          </button>
          
          <button
            onClick={onClose}
            className="px-8 py-2.5 rounded-xl bg-indigo-600 dark:bg-indigo-500 text-white border-2 border-black font-black text-[10px] uppercase tracking-[0.2em] hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-y-0 active:shadow-none transition-all shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
          >
            DONE
          </button>
        </div>

        {isLoading && (
          <div className="absolute inset-0 bg-white/20 dark:bg-black/10 backdrop-blur-[1px] flex items-center justify-center z-[300] pointer-events-none rounded-[24px]">
             <div className="bg-white dark:bg-neutral-900 border-2 border-black dark:border-neutral-700 p-5 rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                <RefreshCw size={28} strokeWidth={3} className="animate-spin text-indigo-600 dark:text-indigo-400" />
             </div>
          </div>
        )}
      </div>
    </div>
  );
};
