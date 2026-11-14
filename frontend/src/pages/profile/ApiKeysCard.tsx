import React, { useEffect, useState } from "react";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import * as api from "../../api";
import { ConfirmModal } from "../../components/ConfirmModal";
import { InfoPopover } from "../../components/InfoPopover";
import {
  SettingsCard,
  SettingsSectionHeader,
  settingsButtonClass,
  settingsSelectClass,
} from "../settings/SettingsRow";
import { useLocale } from "../../context/useLocale";
import type { Locale, TranslationKey } from "../../i18n";
import { formatDateTime } from "../../i18n/format";

const API_KEY_SCOPE_LABELS: Record<string, TranslationKey> = {
  "drawings:read": "apiKeys.scope.drawingsRead",
  "drawings:write": "apiKeys.scope.drawingsWrite",
  "collections:read": "apiKeys.scope.collectionsRead",
  "collections:write": "apiKeys.scope.collectionsWrite",
};

const createButtonClass = "ui-button-primary";

const getApiErrorMessage = (err: unknown, fallback: string) => {
  if (api.isAxiosError(err)) {
    if (err.response?.data?.message) return err.response.data.message;
    if (err.response?.data?.error) return err.response.data.error;
  }
  return fallback;
};

const formatApiKeyDate = (
  value: string | null,
  locale: Locale,
  never: string,
) => {
  if (!value) return never;
  return formatDateTime(value, locale);
};

type Props = {
  disabled: boolean;
  onSuccess: (message: string) => void;
};

export const ApiKeysCard: React.FC<Props> = ({ disabled, onSuccess }) => {
  const { locale, t } = useLocale();
  const formatDate = (value: string | null) =>
    formatApiKeyDate(value, locale, t("apiKeys.never"));
  const [apiKeys, setApiKeys] = useState<api.ApiKeyMetadata[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [apiKeyName, setApiKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    ...api.API_KEY_SCOPES,
  ]);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [generatedToken, setGeneratedToken] = useState("");
  const [generatedTokenName, setGeneratedTokenName] = useState("");
  const [copiedToken, setCopiedToken] = useState(false);
  const [apiKeyToRevoke, setApiKeyToRevoke] =
    useState<api.ApiKeyMetadata | null>(null);
  const [showAllKeys, setShowAllKeys] = useState(false);

  useEffect(() => {
    if (disabled) {
      setApiKeys([]);
      setApiKeysLoading(false);
      setError("");
      return;
    }

    const fetchApiKeys = async () => {
      setApiKeysLoading(true);
      setError("");
      try {
        setApiKeys(await api.listApiKeys());
      } catch (err: unknown) {
        setError(getApiErrorMessage(err, t("apiKeys.errors.load")));
      } finally {
        setApiKeysLoading(false);
      }
    };

    void fetchApiKeys();
  }, [disabled, t]);

  const handleCreateApiKey = async () => {
    if (disabled || apiKeysLoading) return;
    const trimmedName = apiKeyName.trim();
    if (!trimmedName) return setError(t("apiKeys.errors.nameRequired"));
    if (selectedScopes.length === 0)
      return setError(t("apiKeys.errors.scopeRequired"));

    setActionLoading(true);
    setError("");
    onSuccess("");
    try {
      const response = await api.createApiKey(trimmedName, selectedScopes);
      setApiKeys((prev) => [response.apiKey, ...prev]);
      setApiKeyName("");
      setSelectedScopes([...api.API_KEY_SCOPES]);
      setGeneratedToken(response.token);
      setGeneratedTokenName(response.apiKey.name);
      setCopiedToken(false);
      onSuccess(t("apiKeys.created"));
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, t("apiKeys.errors.create")));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyGeneratedToken = async () => {
    if (!generatedToken) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(generatedToken);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = generatedToken;
        textarea.setAttribute("readonly", "true");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedToken(true);
      onSuccess(t("apiKeys.tokenCopied"));
      window.setTimeout(() => setCopiedToken(false), 1500);
    } catch {
      setError(t("apiKeys.errors.copy"));
    }
  };

  const handleApiKeyScopeChange = (scope: string, checked: boolean) => {
    const next = checked
      ? [...selectedScopes, scope]
      : selectedScopes.filter((value) => value !== scope);
    setSelectedScopes(
      api.API_KEY_SCOPES.filter((value) => next.includes(value)),
    );
    setError(next.length === 0 ? t("apiKeys.errors.scopeRequired") : "");
  };

  const handleRevokeApiKey = async (id: string) => {
    setActionLoading(true);
    setError("");
    onSuccess("");
    try {
      await api.revokeApiKey(id);
      const revokedAt = new Date().toISOString();
      setApiKeys((prev) =>
        prev.map((apiKey) =>
          apiKey.id === id ? { ...apiKey, revokedAt } : apiKey,
        ),
      );
      onSuccess(t("apiKeys.revoked"));
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, t("apiKeys.errors.revoke")));
    } finally {
      setActionLoading(false);
      setApiKeyToRevoke(null);
    }
  };

  return (
    <section>
      <SettingsSectionHeader
        icon={<KeyRound size={20} />}
        tileClassName="border-black bg-emerald-400 text-black dark:border-neutral-700 dark:bg-emerald-400 dark:text-black"
        title={t("apiKeys.title")}
        subtitle={t("apiKeys.subtitle")}
      />

      {disabled ? (
        <div className="p-3.5 bg-amber-50 dark:bg-amber-950 border-2 border-amber-200 dark:border-amber-800 rounded-xl">
          <p className="text-amber-900 dark:text-amber-200 font-bold">
            {t("apiKeys.unavailable")}
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-200 font-medium mt-0.5">
            {t("apiKeys.unavailableHint")}
          </p>
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-3 p-3.5 bg-red-50 dark:bg-red-950 border-2 border-red-200 dark:border-red-800 rounded-xl">
              <p className="text-red-800 dark:text-red-200 font-medium">
                {error}
              </p>
            </div>
          )}
          <SettingsCard>
            {generatedToken && (
              <div
                className="border-l-4 border-amber-500 bg-slate-50 px-4 py-3.5 dark:bg-neutral-800 sm:px-5"
                aria-live="polite"
              >
                <p className="text-slate-900 dark:text-white font-bold">
                  {t("apiKeys.copyNow")}
                </p>
                <p className="text-xs text-slate-600 dark:text-neutral-300 font-medium mt-0.5">
                  {t("apiKeys.newKey", { name: generatedTokenName })}
                </p>
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <input
                    aria-label={t("apiKeys.generatedToken", {
                      name: generatedTokenName,
                    })}
                    value={generatedToken}
                    readOnly
                    className={`${settingsSelectClass} flex-1 text-xs font-semibold tracking-tight`}
                    onFocus={(event) => event.target.select()}
                  />
                  <button
                    onClick={() => void handleCopyGeneratedToken()}
                    aria-label={t("apiKeys.copyGeneratedToken")}
                    className="ui-button-primary"
                  >
                    <Copy size={14} />
                    {copiedToken ? t("common.copied") : t("common.copy")}
                  </button>
                  <button
                    onClick={() => {
                      setGeneratedToken("");
                      setGeneratedTokenName("");
                      setCopiedToken(false);
                    }}
                    className={settingsButtonClass}
                  >
                    {t("common.done")}
                  </button>
                </div>
              </div>
            )}

            <div className="px-4 py-3.5 sm:px-5">
              <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1 basis-40">
                  <label
                    htmlFor="apiKeyName"
                    className="block text-sm font-bold text-slate-900 dark:text-white sm:text-base"
                  >
                    {t("apiKeys.nameLabel")}
                  </label>
                  <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-neutral-400">
                    {t("apiKeys.nameExample")}
                  </p>
                </div>
                <input
                  id="apiKeyName"
                  type="text"
                  value={apiKeyName}
                  onChange={(event) => setApiKeyName(event.target.value)}
                  maxLength={100}
                  className={`${settingsSelectClass} ml-auto w-48`}
                  placeholder={t("apiKeys.namePlaceholder")}
                />
                <button
                  onClick={() => void handleCreateApiKey()}
                  disabled={
                    apiKeysLoading ||
                    actionLoading ||
                    !apiKeyName.trim() ||
                    selectedScopes.length === 0
                  }
                  className={createButtonClass}
                >
                  {actionLoading ? t("apiKeys.creating") : t("apiKeys.create")}
                </button>
              </div>
              <fieldset className="mt-3">
                <legend className="text-xs font-semibold text-slate-500 dark:text-neutral-400">
                  {t("apiKeys.scopes")}
                </legend>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {api.API_KEY_SCOPES.map((scope) => (
                    <label
                      key={scope}
                      className="flex items-center gap-2 rounded-lg border-2 border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                    >
                      <input
                        type="checkbox"
                        checked={selectedScopes.includes(scope)}
                        onChange={(event) =>
                          handleApiKeyScopeChange(scope, event.target.checked)
                        }
                        className="h-3.5 w-3.5 accent-emerald-600"
                      />
                      <span>
                        {API_KEY_SCOPE_LABELS[scope]
                          ? t(API_KEY_SCOPE_LABELS[scope])
                          : scope}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            {apiKeysLoading ? (
              <p className="px-4 py-3.5 text-sm text-slate-600 dark:text-neutral-400 font-medium sm:px-5">
                {t("apiKeys.loading")}
              </p>
            ) : apiKeys.length === 0 ? (
              <p className="px-4 py-3.5 text-sm text-slate-600 dark:text-neutral-400 font-medium sm:px-5">
                {t("apiKeys.empty")}
              </p>
            ) : (
              <>
                {apiKeys
                  .slice(0, showAllKeys ? apiKeys.length : 3)
                  .map((apiKey) => {
                    const revoked = Boolean(apiKey.revokedAt);
                    return (
                      <div key={apiKey.id} className="px-4 py-3.5 sm:px-5">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                          <div className="min-w-0 flex-1 basis-40">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-bold text-slate-900 dark:text-white break-words sm:text-base">
                                {apiKey.name}
                              </h3>
                              <span
                                className={
                                  revoked
                                    ? "rounded-full border-2 border-black bg-rose-400 px-2 py-0.5 text-[11px] font-bold text-black dark:border-neutral-700 dark:bg-rose-400 dark:text-black"
                                    : "rounded-full border-2 border-black bg-emerald-400 px-2 py-0.5 text-[11px] font-bold text-black dark:border-neutral-700 dark:bg-emerald-400 dark:text-black"
                                }
                              >
                                {revoked
                                  ? t("apiKeys.status.revoked")
                                  : t("apiKeys.status.active")}
                              </span>
                              <InfoPopover
                                label={t("apiKeys.details", {
                                  name: apiKey.name,
                                })}
                              >
                                <p>
                                  <span className="font-bold text-slate-900 dark:text-white">
                                    {t("apiKeys.prefix")}
                                  </span>
                                  <span className="ml-2 text-slate-500 dark:text-neutral-400">
                                    {apiKey.prefix}
                                  </span>
                                </p>
                                <p>
                                  <span className="font-bold text-slate-900 dark:text-white">
                                    {t("apiKeys.scopes")}
                                  </span>
                                  <span className="ml-2 text-slate-500 dark:text-neutral-400">
                                    {apiKey.scopes.length > 0
                                      ? apiKey.scopes.join(", ")
                                      : t("apiKeys.none")}
                                  </span>
                                </p>
                                <p className="text-slate-500 dark:text-neutral-400">
                                  {t("apiKeys.createdAt", {
                                    date: formatDate(apiKey.createdAt),
                                  })}
                                </p>
                                <p className="text-slate-500 dark:text-neutral-400">
                                  {t("apiKeys.lastUsedAt", {
                                    date: formatDate(apiKey.lastUsedAt),
                                  })}
                                </p>
                                {revoked ? (
                                  <p className="text-slate-500 dark:text-neutral-400">
                                    {t("apiKeys.revokedAt", {
                                      date: formatDate(apiKey.revokedAt),
                                    })}
                                  </p>
                                ) : null}
                              </InfoPopover>
                            </div>
                          </div>
                          {!revoked ? (
                            <button
                              onClick={() => setApiKeyToRevoke(apiKey)}
                              disabled={actionLoading}
                              className="ui-button-secondary ml-auto text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                              aria-label={t("apiKeys.revokeKey", {
                                name: apiKey.name,
                              })}
                            >
                              <Trash2 size={14} />
                              {t("apiKeys.revoke")}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                {apiKeys.length > 3 ? (
                  <div className="px-4 py-3 text-center sm:px-5">
                    <button
                      type="button"
                      className="ui-button-secondary"
                      onClick={() => setShowAllKeys((value) => !value)}
                    >
                      {showAllKeys
                        ? t("apiKeys.showLess")
                        : t("apiKeys.showMore", { count: apiKeys.length - 3 })}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </SettingsCard>
        </>
      )}
      <ConfirmModal
        isOpen={Boolean(apiKeyToRevoke)}
        title={t("apiKeys.revokeTitle")}
        message={
          apiKeyToRevoke
            ? t("apiKeys.revokeMessage", { name: apiKeyToRevoke.name })
            : ""
        }
        confirmText={t("apiKeys.revoke")}
        onConfirm={() =>
          apiKeyToRevoke && void handleRevokeApiKey(apiKeyToRevoke.id)
        }
        onCancel={() => setApiKeyToRevoke(null)}
      />
    </section>
  );
};
