import React, { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Bot, Check, Copy, Plus, Trash2 } from "lucide-react";
import * as api from "../../api";
import { useAuth } from "../../context/AuthContext";
import { buildAgentSkill } from "./agentSkill";

type Props = {
  drawingId: string;
  isOpen: boolean;
};

const smallButtonClass =
  "flex items-center gap-1.5 rounded-lg border-2 border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:border-neutral-400";

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
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-neutral-500">
          Agent access
        </h3>
        <button
          onClick={() => void handleCreate()}
          disabled={busy}
          className={clsx(
            smallButtonClass,
            "text-indigo-600 dark:text-indigo-400",
          )}
        >
          <Plus size={12} strokeWidth={3} />
          New token
        </button>
      </div>

      <p className="text-xs font-medium text-slate-500 dark:text-neutral-400">
        Tokens let an AI agent open this drawing. Keep them secret.
      </p>

      {error && (
        <p className="mt-2 text-xs font-bold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      {freshToken && (
        <div className="mt-3 space-y-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4 dark:border-neutral-700 dark:bg-neutral-800/30 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 dark:text-neutral-200">
              New Agent Token
            </span>
            <span className="rounded bg-rose-100 dark:bg-rose-950/40 px-1.5 py-0.5 text-[9px] font-bold text-rose-700 dark:text-rose-300">
              Shown only once
            </span>
          </div>

          {/* Token Row */}
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-900">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-slate-800 dark:text-slate-250">
              {freshToken}
            </code>
            <button
              onClick={() => void handleCopy(freshToken, "token")}
              className="flex shrink-0 items-center gap-1 rounded border border-slate-350 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 hover:border-slate-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-350 dark:hover:bg-neutral-700"
            >
              {copied === "token" ? (
                <Check size={11} strokeWidth={3} />
              ) : (
                <Copy size={11} strokeWidth={3} />
              )}
              {copied === "token" ? "Copied" : "Copy"}
            </button>
          </div>

          {/* SKILL.md row */}
          <div className="flex flex-col gap-2 pt-2.5 border-t border-slate-200/60 dark:border-neutral-800">
            <p className="text-[11px] text-slate-500 dark:text-neutral-400 leading-normal">
              Configure your agent by copying the <span className="font-semibold text-slate-750 dark:text-neutral-300">SKILL.md</span> integration template. Store the token as <code className="rounded bg-slate-100 dark:bg-neutral-800 px-1 py-0.5 font-mono font-bold text-[10px] text-slate-700 dark:text-neutral-300">EXCALIDASH_TOKEN</code>.
            </p>
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
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-slate-800 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-slate-700 dark:border-neutral-600 dark:bg-neutral-700 dark:hover:bg-neutral-600"
            >
              {copied === "skill" ? (
                <Check size={13} strokeWidth={2.5} />
              ) : (
                <Copy size={13} strokeWidth={2.5} />
              )}
              {copied === "skill" ? "SKILL.md copied!" : "Copy SKILL.md integration"}
            </button>
          </div>
        </div>
      )}

      {tokens.length === 0 ? (
        <p className="mt-2 text-xs font-medium text-slate-400 dark:text-neutral-500">
          No agent tokens yet.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-neutral-800">
          {tokens.map((token) => (
            <li key={token.id} className="flex items-center gap-2 py-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
                <Bot size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-700 dark:text-neutral-200">
                  {token.name}
                </p>
                <p className="truncate font-mono text-[11px] text-slate-400 dark:text-neutral-500">
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
