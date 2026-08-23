import React, { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Bot, Check, Copy, Plus, Trash2 } from "lucide-react";
import * as api from "../../api";

type Props = {
  drawingId: string;
  isOpen: boolean;
};

// Owner-only "Agent access" section. Lists per-drawing agent tokens and lets the
// owner mint or revoke them. The raw token is shown exactly once, right after
// minting. If the current user is not the drawing owner the backend answers
// 403/404 and the whole section hides itself.
export const AgentAccessSection: React.FC<Props> = ({ drawingId, isOpen }) => {
  const [available, setAvailable] = useState(true);
  const [tokens, setTokens] = useState<api.AgentTokenRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const rows = await api.listAgentTokens(drawingId);
      setTokens(rows);
      setAvailable(true);
    } catch (err: unknown) {
      if (
        api.isAxiosError(err) &&
        (err.response?.status === 403 || err.response?.status === 404)
      ) {
        setAvailable(false);
        return;
      }
      setError("Failed to load agent tokens");
    }
  }, [drawingId]);

  useEffect(() => {
    if (!isOpen) return;
    setFreshToken(null);
    setError(null);
    setCopied(false);
    void refresh();
  }, [isOpen, refresh]);

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const { token } = await api.createAgentToken(drawingId);
      setFreshToken(token);
      setCopied(false);
      await refresh();
    } catch {
      setError("Failed to create agent token");
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (tokenId: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.revokeAgentToken(drawingId, tokenId);
      await refresh();
    } catch {
      setError("Failed to revoke agent token");
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be denied; the token stays visible for manual copy.
    }
  };

  if (!available) return null;

  return (
    <section className="pt-5 border-t-2 border-black dark:border-neutral-700">
      <div className="flex items-center justify-between px-1 mb-3">
        <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-neutral-500">
          Agent access
        </h3>
        <button
          onClick={() => void handleCreate()}
          disabled={busy}
          className={clsx(
            "flex items-center gap-1 px-2.5 py-1 rounded-lg border-2 border-black dark:border-neutral-600 bg-white dark:bg-neutral-900 text-indigo-600 dark:text-indigo-400 font-black text-[10px] uppercase tracking-wide shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.05)] hover:-translate-y-0.5 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all",
            busy && "opacity-40 cursor-not-allowed shadow-none",
          )}
        >
          <Plus size={12} strokeWidth={3} />
          New token
        </button>
      </div>

      <div className="flex items-start gap-4 px-1">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border-2 border-slate-400 dark:border-neutral-600 bg-slate-50 dark:bg-neutral-800 text-slate-400 dark:text-neutral-500 mt-0.5">
          <Bot size={18} strokeWidth={3} />
        </div>

        <div className="flex-1 min-w-0 space-y-2.5">
          <p className="text-[11px] font-bold text-slate-500 dark:text-neutral-400 leading-snug">
            Tokens let an AI agent read and edit only this drawing over the API.
            Keep them secret.
          </p>

          {error && (
            <p className="text-[10px] font-black text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}

          {freshToken && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border-2 border-amber-500 space-y-2 shadow-[2px_2px_0px_0px_rgba(245,158,11,0.2)]">
              <p className="text-[8px] font-black uppercase tracking-[0.15em] text-amber-700 dark:text-amber-300">
                Copy now — shown only once
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate text-[10px] font-mono font-bold text-amber-900 dark:text-amber-100">
                  {freshToken}
                </code>
                <button
                  onClick={() => void handleCopy(freshToken)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg border-2 border-black bg-white dark:bg-neutral-900 text-amber-700 dark:text-amber-300 font-black text-[9px] shrink-0 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all"
                >
                  {copied ? (
                    <Check size={11} strokeWidth={3} />
                  ) : (
                    <Copy size={11} strokeWidth={3} />
                  )}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          )}

          {tokens.length === 0 ? (
            <p className="text-[10px] font-black text-slate-400 dark:text-neutral-500">
              No agent tokens yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {tokens.map((token) => (
                <li
                  key={token.id}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border-2 border-slate-300 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800/60"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black text-slate-700 dark:text-neutral-200 truncate">
                      {token.name}
                    </p>
                    <p className="text-[9px] font-mono font-bold text-slate-400 dark:text-neutral-500 truncate">
                      {token.prefix}…
                      {token.lastUsedAt ? " · used" : " · never used"}
                    </p>
                  </div>
                  <button
                    onClick={() => void handleRevoke(token.id)}
                    disabled={busy}
                    title="Revoke token"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors shrink-0 disabled:opacity-40"
                  >
                    <Trash2 size={14} strokeWidth={2.5} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};
