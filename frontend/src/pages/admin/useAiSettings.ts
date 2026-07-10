import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import * as api from "../../api";

export type AiProvider = "disabled" | "anthropic" | "openai" | "custom";

type AiSettingsResponse = {
  status: {
    available: boolean;
    provider: AiProvider;
    model: string | null;
    keyConfigured: boolean;
    keySource: "env" | "db" | null;
  };
  overrides: {
    provider: AiProvider | null;
    baseUrl: string | null;
    model: string | null;
  };
  envKeyConfigured: boolean;
  dbKeyConfigured: boolean;
};

const KEY_UNCHANGED = "";

type UseAiSettingsParams = {
  authEnabled: boolean | null;
  isAdmin: boolean;
  setError: (message: string) => void;
};

export const useAiSettings = ({ authEnabled, isAdmin, setError }: UseAiSettingsParams) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState<AiProvider>("disabled");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState(KEY_UNCHANGED);
  const [status, setStatus] = useState<AiSettingsResponse["status"] | null>(null);
  const [envKeyConfigured, setEnvKeyConfigured] = useState(false);
  const [dbKeyConfigured, setDbKeyConfigured] = useState(false);

  const applyResponse = useCallback((data: AiSettingsResponse) => {
    setStatus(data.status);
    setProvider((data.overrides.provider ?? data.status.provider) as AiProvider);
    setBaseUrl(data.overrides.baseUrl ?? "");
    setModel(data.overrides.model ?? "");
    setEnvKeyConfigured(data.envKeyConfigured);
    setDbKeyConfigured(data.dbKeyConfigured);
    setApiKey(KEY_UNCHANGED);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.api.get<AiSettingsResponse>("/auth/ai/settings");
      applyResponse(res.data);
    } catch (err: unknown) {
      let message = "Failed to load AI settings";
      if (api.isAxiosError(err)) {
        message = err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [applyResponse, setError]);

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        provider,
        baseUrl: baseUrl.trim() || null,
        model: model.trim() || null,
      };
      // Only send apiKey when the admin typed something (empty = leave as-is).
      if (apiKey !== KEY_UNCHANGED) payload.apiKey = apiKey;
      const res = await api.api.put<AiSettingsResponse>("/auth/ai/settings", payload);
      applyResponse(res.data);
      toast.success("AI settings saved");
    } catch (err: unknown) {
      let message = "Failed to save AI settings";
      if (api.isAxiosError(err)) {
        message = err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [saving, provider, baseUrl, model, apiKey, applyResponse, setError]);

  const clearDbKey = useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      const res = await api.api.put<AiSettingsResponse>("/auth/ai/settings", { apiKey: "" });
      applyResponse(res.data);
      toast.success("Stored AI key cleared");
    } catch (err: unknown) {
      let message = "Failed to clear AI key";
      if (api.isAxiosError(err)) {
        message = err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [applyResponse, setError]);

  useEffect(() => {
    if (!authEnabled || !isAdmin) return;
    void load();
  }, [authEnabled, isAdmin, load]);

  return {
    loading,
    saving,
    provider,
    baseUrl,
    model,
    apiKey,
    status,
    envKeyConfigured,
    dbKeyConfigured,
    setProvider,
    setBaseUrl,
    setModel,
    setApiKey,
    load,
    save,
    clearDbKey,
  };
};
