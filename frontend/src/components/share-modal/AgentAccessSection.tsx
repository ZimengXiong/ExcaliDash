import React, { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Bot, Check, Copy, Plus, Trash2 } from "lucide-react";
import * as api from "../../api";
import { buildAgentSkill } from "./agentSkill";

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
  const [copied, setCopied] = useState<"token" | "skill" | null>(null);

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
    setCopied(null);
    void refresh();
  }, [isOpen, refresh]);

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const { token } = await api.createAgentToken(drawingId);
      setFreshToken(token);
      setCopied(null);
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

  const handleCopy = async (text: string, kind: "token" | "skill") => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard can be denied; the token stays visible for manual copy.
    }
  };

  if (!available) return null;

  return (
    <section className="pt-5 border-t border-slate-200 dark:border-neutral-800">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-neutral-100">
          Agent access
        </h3>
        <button
          onClick={() => void handleCreate()}
          disabled={busy}
          className={clsx(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-indigo-600 dark:text-indigo-400 font-semibold text-xs hover:bg-slate-50 dark:hover:bg-neutral-800 transition-colors",
            busy && "opacity-40 cursor-not-allowed shadow-none",
          )}
        >
          <Plus size={12} strokeWidth={3} />
          New token
        </button>
      </div>

      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-slate-100 dark:bg-neutral-800 text-slate-500 dark:text-neutral-400">
          <Bot size={18} strokeWidth={3} />
        </div>

        <div className="flex-1 min-w-0 space-y-2.5">
          <p className="text-xs text-slate-500 dark:text-neutral-400 leading-relaxed">
            Create a secure token for an AI agent to access this drawing. Keep
            tokens private.
          </p>

          {error && (
            <p className="text-[10px] font-black text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}

          {freshToken && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-300 dark:border-amber-700/70 space-y-2">
              <p className="text-[8px] font-black uppercase tracking-[0.15em] text-amber-700 dark:text-amber-300">
                Copy now — shown only once
              </p>
              <div className="flex items-center gap-2">
                <span className="flex-1 min-w-0 truncate text-[11px] font-semibold text-amber-900 dark:text-amber-100">
                  {freshToken}
                </span>
                <button
                  onClick={() => void handleCopy(freshToken, "token")}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-neutral-900 text-amber-700 dark:text-amber-300 font-semibold text-[10px] shrink-0 hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-colors"
                >
                  {copied === "token" ? (
                    <Check size={11} strokeWidth={3} />
                  ) : (
                    <Copy size={11} strokeWidth={3} />
                  )}
                  {copied === "token" ? "Copied" : "Copy token"}
                </button>
              </div>
              <button
                onClick={() =>
                  void handleCopy(
                    buildAgentSkill({
                      origin: window.location.origin,
                      drawingId,
                    }),
                    "skill",
                  )
                }
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
              >
                {copied === "skill" ? (
                  <Check size={13} strokeWidth={2.5} />
                ) : (
                  <Copy size={13} strokeWidth={2.5} />
                )}
                {copied === "skill" ? "SKILL.md copied" : "Copy SKILL.md"}
              </button>
              <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">
                The skill does not contain your secret. Store the copied token
                as <span className="font-semibold">EXCALIDASH_TOKEN</span> in
                your agent&apos;s credential store.
              </p>
            </div>
          )}

          {tokens.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-neutral-500">
              No agent tokens yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {tokens.map((token) => (
                <li
                  key={token.id}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-800/60"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black text-slate-700 dark:text-neutral-200 truncate">
                      {token.name}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-neutral-500 truncate">
                      {token.prefix}…
                      {token.expiresAt && Date.parse(token.expiresAt) <= Date.now()
                        ? " · expired"
                        : token.expiresAt
                          ? ` · expires ${new Date(token.expiresAt).toLocaleDateString()}`
                          : " · no expiry"}
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
