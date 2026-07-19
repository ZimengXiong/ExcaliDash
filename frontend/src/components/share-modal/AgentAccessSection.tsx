import React, { useCallback, useEffect, useState } from "react";
import { Check, Copy, Plus, Trash2 } from "lucide-react";
import * as api from "../../api";
import { useAuth } from "../../context/AuthContext";
import { buildAgentSkill } from "./agentSkill";
import { InfoPopover } from "../InfoPopover";

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
  const [showAllTokens, setShowAllTokens] = useState(false);

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
        <h3 className="text-xs font-semibold text-slate-400 dark:text-neutral-500">
          Agent access
        </h3>
        <button
          onClick={() => void handleCreate()}
          disabled={busy}
          className="ui-button-secondary px-3.5 py-2 text-indigo-600 dark:text-indigo-300"
        >
          <Plus size={14} strokeWidth={2.5} />
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
            <code className="min-w-0 flex-1 select-all truncate text-xs font-semibold tracking-tight text-slate-850 dark:text-slate-250">
              {freshToken}
            </code>
            <button
              onClick={() => void handleCopy(freshToken, "token")}
              className="ui-button-secondary shrink-0 px-2.5 py-1 text-xs"
            >
              {copied === "token" ? (
                <Check size={12} strokeWidth={2.5} />
              ) : (
                <Copy size={12} strokeWidth={2.5} />
              )}
              {copied === "token" ? "Copied" : "Copy"}
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
            className="ui-button-primary w-full text-xs"
          >
            {copied === "skill" ? (
              <Check size={13} strokeWidth={2.5} />
            ) : (
              <Copy size={13} strokeWidth={2.5} />
            )}
            {copied === "skill" ? "Copied" : "Copy setup"}
          </button>
        </div>
      )}

      {tokens.length === 0 ? (
        <p className="mt-2 text-xs font-medium text-slate-400 dark:text-neutral-500">
          No tokens
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-neutral-800">
          {tokens.slice(0, showAllTokens ? tokens.length : 3).map((token) => (
            <li key={token.id} className="flex flex-wrap items-center gap-2.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-700 dark:text-neutral-200">
                  {token.name}
                </p>
              </div>
              <InfoPopover label={`Details for ${token.name}`}>
                <div className="space-y-1.5 text-slate-500 dark:text-neutral-400">
                  <p><span className="font-bold text-slate-900 dark:text-white">Prefix</span> {token.prefix}…</p>
                  <p>
                    {token.expiresAt && Date.parse(token.expiresAt) <= Date.now()
                      ? "Expired"
                      : token.expiresAt
                        ? `Expires ${new Date(token.expiresAt).toLocaleDateString()}`
                        : "No expiry"}
                  </p>
                </div>
              </InfoPopover>
              <button
                onClick={() => void handleRevoke(token.id)}
                disabled={busy}
                title="Revoke token"
                className="ui-icon-button h-8 w-8 shrink-0 border-transparent bg-transparent text-slate-400 shadow-none hover:bg-rose-50 hover:text-rose-600 dark:bg-transparent dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
          {tokens.length > 3 ? (
            <li className="py-3 text-center">
              <button
                type="button"
                className="ui-button-secondary"
                onClick={() => setShowAllTokens((value) => !value)}
              >
                {showAllTokens ? "Show less" : `Show ${tokens.length - 3} more`}
              </button>
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
};
