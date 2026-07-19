import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import * as api from "../../api";
import type { AiProvider, AiProviderProfile, AiStatus } from "../../api/ai";

export type ConfigurableAiProvider = Exclude<AiProvider, "disabled">;

export type AiProviderDraft = {
  id: string;
  label: string;
  provider: ConfigurableAiProvider;
  enabled: boolean;
  baseUrl: string;
  modelsText: string;
  reasoningEffortsText: string;
  apiKey: string;
  keyConfigured: boolean;
  keySource: "env" | "db" | null;
  clearApiKey?: boolean;
};

type AiSettingsResponse = {
  status: AiStatus;
  providers: AiProviderProfile[];
  defaultProviderId: string | null;
};

const toDraft = (profile: AiProviderProfile): AiProviderDraft | null => {
  if (profile.provider === "disabled") return null;
  const efforts = [
    ...new Set(profile.models.flatMap((model) => model.reasoningEfforts)),
  ];
  return {
    id: profile.id,
    label: profile.label,
    provider: profile.provider,
    enabled: profile.enabled,
    baseUrl: profile.baseUrl ?? "",
    modelsText: profile.models.map((model) => model.id).join(", "),
    reasoningEffortsText: efforts.join(", "),
    apiKey: "",
    keyConfigured: profile.keyConfigured,
    keySource: profile.keySource,
  };
};

const splitCsv = (value: string): string[] => [
  ...new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ),
];

const defaultsForProvider = (
  provider: ConfigurableAiProvider,
): Partial<AiProviderDraft> => {
  if (provider === "chatgpt") {
    return {
      label: "ChatGPT subscription",
      baseUrl: "",
      modelsText: "",
      reasoningEffortsText: "",
      apiKey: "",
      keyConfigured: false,
      keySource: null,
      clearApiKey: true,
    };
  }
  if (provider === "anthropic") {
    return {
      label: "Anthropic",
      baseUrl: "",
      modelsText: "claude-opus-4-8",
      reasoningEffortsText: "",
      clearApiKey: false,
    };
  }
  if (provider === "openai") {
    return {
      label: "OpenAI",
      baseUrl: "",
      modelsText: "gpt-4o",
      reasoningEffortsText: "",
      clearApiKey: false,
    };
  }
  if (provider === "gemini") {
    return {
      label: "Google Gemini",
      baseUrl: "",
      modelsText: "gemini-2.5-pro",
      reasoningEffortsText: "low, medium, high",
      clearApiKey: false,
    };
  }
  return {
    label: "OpenAI-compatible",
    baseUrl: "",
    modelsText: "",
    reasoningEffortsText: "",
    clearApiKey: false,
  };
};

export const useAiSettings = ({
  authEnabled,
  isAdmin,
  setError,
}: {
  authEnabled: boolean | null;
  isAdmin: boolean;
  setError: (message: string) => void;
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [providers, setProviders] = useState<AiProviderDraft[]>([]);
  const [defaultProviderId, setDefaultProviderId] = useState("");
  const [status, setStatus] = useState<AiStatus | null>(null);

  const applyResponse = useCallback((data: AiSettingsResponse) => {
    const drafts = data.providers
      .map(toDraft)
      .filter((item): item is AiProviderDraft => Boolean(item));
    setProviders(drafts);
    setDefaultProviderId(data.defaultProviderId ?? drafts[0]?.id ?? "");
    setStatus(data.status);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      applyResponse(
        (await api.api.get<AiSettingsResponse>("/auth/ai/settings")).data,
      );
    } catch (error) {
      setError(
        api.isAxiosError(error)
          ? (error.response?.data?.message ?? "Failed to load AI settings")
          : "Failed to load AI settings",
      );
    } finally {
      setLoading(false);
    }
  }, [applyResponse, setError]);

  const addProvider = useCallback(() => {
    const id = `provider_${Date.now().toString(36)}`;
    setProviders((current) => [
      ...current,
      {
        id,
        label: "OpenAI",
        provider: "openai",
        enabled: true,
        baseUrl: "",
        modelsText: "gpt-4o",
        reasoningEffortsText: "",
        apiKey: "",
        keyConfigured: false,
        keySource: null,
      },
    ]);
    setDefaultProviderId((current) => current || id);
  }, []);

  const updateProvider = useCallback(
    (id: string, patch: Partial<AiProviderDraft>) => {
      setProviders((current) =>
        current.map((profile) => {
          if (profile.id !== id) return profile;
          const providerDefaults =
            patch.provider && patch.provider !== profile.provider
              ? defaultsForProvider(patch.provider)
              : {};
          return { ...profile, ...providerDefaults, ...patch };
        }),
      );
    },
    [],
  );

  const removeProvider = useCallback((id: string) => {
    setProviders((current) => current.filter((profile) => profile.id !== id));
    setDefaultProviderId((current) => (current === id ? "" : current));
  }, []);

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const payloadProviders = providers.map((profile) => {
        const isChatGpt = profile.provider === "chatgpt";
        const efforts = isChatGpt ? [] : splitCsv(profile.reasoningEffortsText);
        const models = isChatGpt
          ? []
          : splitCsv(profile.modelsText).map((id) => ({
              id,
              label: id,
              reasoningEfforts: efforts,
            }));
        return {
          id: profile.id,
          label: profile.label.trim() || profile.id,
          provider: profile.provider,
          enabled: profile.enabled,
          baseUrl: isChatGpt ? null : profile.baseUrl.trim() || null,
          models,
          ...(!isChatGpt && profile.apiKey ? { apiKey: profile.apiKey } : {}),
          ...(profile.clearApiKey ? { clearApiKey: true } : {}),
        };
      });
      if (
        payloadProviders.some(
          (profile) =>
            profile.provider !== "chatgpt" && profile.models.length === 0,
        )
      ) {
        setError("Every API-key provider needs at least one model");
        return;
      }
      const response = await api.api.put<AiSettingsResponse>(
        "/auth/ai/settings",
        {
          providers: payloadProviders,
          defaultProviderId:
            defaultProviderId || payloadProviders[0]?.id || null,
        },
      );
      applyResponse(response.data);
      toast.success("AI provider registry saved");
    } catch (error) {
      setError(
        api.isAxiosError(error)
          ? (error.response?.data?.message ?? "Failed to save AI settings")
          : "Failed to save AI settings",
      );
    } finally {
      setSaving(false);
    }
  }, [applyResponse, defaultProviderId, providers, saving, setError]);

  useEffect(() => {
    if (authEnabled !== null && isAdmin) void load();
  }, [authEnabled, isAdmin, load]);

  return {
    loading,
    saving,
    providers,
    defaultProviderId,
    status,
    setDefaultProviderId,
    addProvider,
    updateProvider,
    removeProvider,
    save,
  };
};
