import React, { useCallback, useEffect, useState } from "react";
import { Bot, Check, Copy, Plus, Trash2 } from "lucide-react";
import * as api from "../../api";
import { useAuth } from "../../context/AuthContext";
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
  const { aiEnabled } = useAuth();
  const [available, setAvailable] = useState(false);
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
    if (!isOpen || !aiEnabled) {
      setAvailable(false);
      return;
    }
    setFreshToken(null);
    setError(null);
    setCopied(null);
    void refresh();
  }, [aiEnabled, isOpen, refresh]);

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

  if (!aiEnabled || !available) return null;

  return (
    <section className="border-t-2 border-slate-100 pt-4 dark:border-neutral-800">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-neutral-500">
          Agent access
        </h3>
        <button
          onClick={() => void handleCreate()}
          disabled={busy}
          className="flex items-center gap-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100/80 px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-50"
        >
          <Plus size={12} strokeWidth={2.5} />
          New token
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs font-bold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      {freshToken && (
        <div className="mt-3 space-y-3 rounded-xl border-2 border-slate-800 bg-slate-50/50 p-3.5 dark:border-neutral-700 dark:bg-neutral-800/30 animate-in fade-in duration-200 shadow-[1.5px_1.5px_0px_0px_rgba(30,41,59,0.9)]">
          {/* Token display row */}
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-slate-850 dark:text-slate-250 select-all">
              {freshToken}
            </code>
            <button
              onClick={() => void handleCopy(freshToken, "token")}
              className="flex shrink-0 items-center gap-1 rounded-lg border-2 border-slate-800 bg-white px-2.5 py-1 text-xs font-semibold text-slate-705 hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-205 shadow-[1px_1px_0px_0px_rgba(30,41,59,0.9)]"
            >
              {copied === "token" ? (
                <Check size={12} strokeWidth={2.5} />
              ) : (
                <Copy size={12} strokeWidth={2.5} />
              )}
              {copied === "token" ? "Copied" : "Copy Token"}
            </button>
          </div>

          {/* Copy SKILL.md Template */}
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
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-slate-800 bg-slate-800 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-slate-700 dark:border-neutral-600 dark:bg-slate-700 dark:hover:bg-neutral-600 shadow-[1px_1px_0px_0px_rgba(30,41,59,0.9)]"
          >
            {copied === "skill" ? (
              <Check size={13} strokeWidth={2.5} />
            ) : (
              <Copy size={13} strokeWidth={2.5} />
            )}
            {copied === "skill" ? "SKILL.md copied!" : "Copy SKILL.md integration"}
          </button>
        </div>
      )}

      {tokens.length === 0 ? (
        <p className="mt-2 text-xs font-medium text-slate-400 dark:text-neutral-500">
          No agent tokens yet.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-neutral-800">
          {tokens.map((token) => (
            <li key={token.id} className="flex items-center gap-2.5 py-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-neutral-850 dark:text-neutral-400">
                <Bot size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-700 dark:text-neutral-200">
                  {token.name}
                </p>
                <p className="truncate text-[10px] font-medium text-slate-400 dark:text-neutral-500">
                  <span className="font-mono">{token.prefix}…</span>
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
                className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
