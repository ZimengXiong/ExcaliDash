import React, { useEffect, useState } from "react";
import { Bot, Copy } from "lucide-react";
import * as api from "../../api";
import {
  SettingsCard,
  SettingsSectionHeader,
  settingsButtonClass,
  settingsSelectClass,
} from "../settings/SettingsRow";
import { buildClaudeCodeCommand, buildMcpClientConfig } from "./mcpConfig";

const getApiErrorMessage = (err: unknown, fallback: string) => {
  if (api.isAxiosError(err)) {
    if (err.response?.data?.message) return err.response.data.message;
    if (err.response?.data?.error) return err.response.data.error;
  }
  return fallback;
};

const copyText = async (value: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
};

const codeBlockClass =
  "mt-1.5 max-h-56 overflow-auto whitespace-pre rounded-lg border-2 border-slate-200 bg-slate-50 p-3 text-xs font-mono text-slate-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200";

type Snippet = { id: string; label: string; value: string };

type Props = {
  disabled: boolean;
  /** API keys, and therefore agents, need authentication to be enabled. */
  authEnabled: boolean | null;
  onSuccess: (message: string) => void;
  onApiKeyCreated: () => void;
};

export const McpConnectCard: React.FC<Props> = ({
  disabled,
  authEnabled,
  onSuccess,
  onApiKeyCreated,
}) => {
  const [status, setStatus] = useState<api.McpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState("");
  const endpointUrl = api.getMcpEndpointUrl();

  useEffect(() => {
    let cancelled = false;
    api
      .getMcpStatus()
      .then((value) => {
        if (!cancelled) setStatus(value);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCopy = async (id: string, value: string) => {
    try {
      await copyText(value);
      setCopied(id);
      window.setTimeout(() => setCopied(""), 1500);
    } catch {
      setError("Failed to copy. Select and copy it manually.");
    }
  };

  const handleConnect = async () => {
    setCreating(true);
    setError("");
    onSuccess("");
    try {
      const name = `AI agent (MCP) ${new Date().toLocaleDateString()}`;
      const response = await api.createApiKey(name, [...api.API_KEY_SCOPES]);
      setToken(response.token);
      onApiKeyCreated();
      onSuccess(
        `Created API key "${response.apiKey.name}" for your AI agent. Copy the configuration now; the key will not be shown again.`,
      );
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "Failed to create an API key"));
    } finally {
      setCreating(false);
    }
  };

  const snippets: Snippet[] = token
    ? [
        {
          id: "json",
          label: "MCP client configuration (JSON)",
          value: buildMcpClientConfig(endpointUrl, token),
        },
        {
          id: "claude",
          label: "Claude Code",
          value: buildClaudeCodeCommand(endpointUrl, token),
        },
      ]
    : [];

  const enabled = Boolean(status?.enabled && status.available);

  return (
    <section>
      <SettingsSectionHeader
        icon={<Bot size={20} />}
        tileClassName="border-black bg-violet-400 text-black dark:border-neutral-700 dark:bg-violet-400 dark:text-black"
        title="AI Agents (MCP)"
        subtitle="Let AI assistants read and edit your drawings"
      />
      {error && (
        <div className="mb-3 p-3.5 bg-red-50 dark:bg-red-950 border-2 border-red-200 dark:border-red-800 rounded-xl">
          <p className="text-red-800 dark:text-red-200 font-medium">{error}</p>
        </div>
      )}
      <SettingsCard>
        {loading ? (
          <p className="px-4 py-3.5 text-sm text-slate-600 dark:text-neutral-400 font-medium sm:px-5">
            Checking MCP availability...
          </p>
        ) : !enabled ? (
          <div className="px-4 py-3.5 sm:px-5">
            <p className="text-sm font-bold text-slate-900 dark:text-white sm:text-base">
              The MCP server is turned off on this instance.
            </p>
            <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-neutral-400">
              {status?.enabled
                ? "It is enabled but failed to start; check the backend logs."
                : "An administrator can turn it on with MCP_ENABLED=true on the backend."}
            </p>
          </div>
        ) : (
          <>
            <div className="px-4 py-3.5 sm:px-5">
              <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1 basis-40">
                  <p className="text-sm font-bold text-slate-900 dark:text-white sm:text-base">
                    MCP endpoint
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-neutral-400">
                    Works with any MCP client that supports Streamable HTTP.
                    Each agent uses its own API key and sees only what you can.
                  </p>
                </div>
                <input
                  aria-label="MCP endpoint URL"
                  value={endpointUrl}
                  readOnly
                  onFocus={(event) => event.target.select()}
                  className={`${settingsSelectClass} ml-auto w-64 text-xs font-semibold`}
                />
                <button
                  onClick={() => void handleCopy("url", endpointUrl)}
                  className={settingsButtonClass}
                  aria-label="Copy MCP endpoint URL"
                >
                  <Copy size={14} />
                  {copied === "url" ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <div className="px-4 py-3.5 sm:px-5">
              {token ? (
                <div aria-live="polite">
                  <p className="text-slate-900 dark:text-white font-bold">
                    Add this to your AI client. The key is shown only once.
                  </p>
                  {snippets.map((snippet) => (
                    <div key={snippet.id} className="mt-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-500 dark:text-neutral-400">
                          {snippet.label}
                        </span>
                        <button
                          onClick={() =>
                            void handleCopy(snippet.id, snippet.value)
                          }
                          className={settingsButtonClass}
                          aria-label={`Copy ${snippet.label}`}
                        >
                          <Copy size={14} />
                          {copied === snippet.id ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <pre className={codeBlockClass}>{snippet.value}</pre>
                    </div>
                  ))}
                  <div className="mt-3">
                    <button
                      onClick={() => setToken("")}
                      className={settingsButtonClass}
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : authEnabled === false ? (
                <p className="text-xs font-medium text-slate-500 dark:text-neutral-400">
                  Agents sign in with a personal API key, which needs user
                  accounts. Turn on authentication in Settings to connect an
                  agent.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <p className="min-w-0 flex-1 basis-40 text-xs font-medium text-slate-500 dark:text-neutral-400">
                    Creates an API key with drawing and collection access and
                    shows a ready-to-paste client configuration. Revoke it under
                    API Keys to disconnect the agent.
                  </p>
                  <button
                    onClick={() => void handleConnect()}
                    disabled={disabled || creating}
                    className="ui-button-primary ml-auto"
                  >
                    <Bot size={14} />
                    {creating ? "Creating..." : "Connect an AI agent"}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </SettingsCard>
    </section>
  );
};
