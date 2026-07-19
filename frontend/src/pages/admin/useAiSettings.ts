import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import * as api from "../../api";
import type {
  AiConnectionTestResult,
  AiModelOption,
  AiProvider,
  AiProviderDefinition,
  AiProviderProfile,
  AiStatus,
} from "../../api/ai";
import { prepareAiProviderSave } from "./prepareAiProviderSave";
export type ConfigurableAiProvider = Exclude<AiProvider, "disabled">;
export type AiProviderDraft = {
  id: string;
  label: string;
  provider: ConfigurableAiProvider;
  enabled: boolean;
  baseUrl: string;
  modelsText: string;
  customModelsText: string;
  reasoningEffortsText: string;
  apiKey: string;
  keyConfigured: boolean;
  keySource: "env" | "db" | null;
  clearApiKey?: boolean;
  discoveredModels: AiModelOption[];
  discoverySource?: "live" | "cache" | "fallback" | "configured";
  discoveryWarning?: string;
  testing?: boolean;
  discovering?: boolean;
  testResult?: AiConnectionTestResult;
};
type AiSettingsResponse = {
  status: AiStatus;
  providers: AiProviderProfile[];
  defaultProviderId: string | null;
  providerDefinitions: AiProviderDefinition[];
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
    customModelsText: (profile.customModels ?? [])
      .map((model) => model.id)
      .join(", "),
    reasoningEffortsText: efforts.join(", "),
    apiKey: "",
    keyConfigured: profile.keyConfigured,
    keySource: profile.keySource,
    discoveredModels: profile.models,
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
  definitions: AiProviderDefinition[],
): Partial<AiProviderDraft> => {
  const definition = definitions.find((item) => item.id === provider);
  if (provider === "chatgpt") {
    return {
      label: "ChatGPT subscription",
      baseUrl: "",
      modelsText: "",
      customModelsText: "",
      reasoningEffortsText: "",
      apiKey: "",
      keyConfigured: false,
      keySource: null,
      clearApiKey: true,
      discoveredModels: [],
    };
  }
  return {
    label: definition?.label ?? "OpenAI-compatible",
    baseUrl: "",
    modelsText: definition?.defaultModel ?? "",
    customModelsText: "",
    reasoningEffortsText: "",
    clearApiKey: false,
    discoveredModels: definition?.defaultModel
      ? [
          {
            id: definition.defaultModel,
            label: definition.defaultModel,
            reasoningEfforts: [],
          },
        ]
      : [],
    discoveryWarning: undefined,
    discoverySource: undefined,
    testResult: undefined,
  };
};
export const useAiSettings = ({
  authEnabled,
  setError,
  onFeatureFlagChanged,
}: {
  authEnabled: boolean | null;
  setError: (message: string) => void;
  onFeatureFlagChanged?: () => Promise<void>;
}) => {
  const [enabled, setEnabledState] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [providers, setProviders] = useState<AiProviderDraft[]>([]);
  const [defaultProviderId, setDefaultProviderId] = useState("");
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [providerDefinitions, setProviderDefinitions] = useState<
    AiProviderDefinition[]
  >([]);
  const applyResponse = useCallback((data: AiSettingsResponse) => {
    const drafts = data.providers
      .map(toDraft)
      .filter((item): item is AiProviderDraft => Boolean(item));
    setProviders(drafts);
    setDefaultProviderId(data.defaultProviderId ?? drafts[0]?.id ?? "");
    setStatus(data.status);
    setProviderDefinitions(data.providerDefinitions);
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const flag = await api.api.get<{ enabled: boolean }>("/auth/ai/enabled");
      const nextEnabled = flag.data.enabled !== false;
      setEnabledState(nextEnabled);
      if (!nextEnabled) {
        setProviders([]);
        setDefaultProviderId("");
        setStatus(null);
        return;
      }
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
  const setEnabled = useCallback(
    async (nextEnabled: boolean) => {
      if (saving) return;
      setSaving(true);
      setError("");
      try {
        const response = await api.api.put<{ enabled: boolean }>(
          "/auth/ai/enabled",
          { enabled: nextEnabled },
        );
        const savedEnabled = response.data.enabled !== false;
        setEnabledState(savedEnabled);
        if (savedEnabled) {
          await load();
        } else {
          setProviders([]);
          setDefaultProviderId("");
          setStatus(null);
        }
        await onFeatureFlagChanged?.();
        toast.success(
          savedEnabled ? "AI features enabled" : "AI features disabled",
        );
      } catch (error) {
        setError(
          api.isAxiosError(error)
            ? (error.response?.data?.message ??
                "Failed to update AI feature setting")
            : "Failed to update AI feature setting",
        );
      } finally {
        setSaving(false);
      }
    },
    [load, onFeatureFlagChanged, saving, setError],
  );
  const addProvider = useCallback(
    (provider: ConfigurableAiProvider = "openai") => {
    const id = `provider_${Date.now().toString(36)}`;
    const defaults = defaultsForProvider(provider, providerDefinitions);
    setProviders((current) => [
      ...current,
      {
        id,
        label: defaults.label ?? "OpenAI",
        provider,
        enabled: true,
        baseUrl: defaults.baseUrl ?? "",
        modelsText: defaults.modelsText ?? "",
        customModelsText: "",
        reasoningEffortsText: "",
        apiKey: "",
        keyConfigured: false,
        keySource: null,
        discoveredModels: defaults.discoveredModels ?? [],
      },
    ]);
    setDefaultProviderId((current) => current || id);
    },
    [providerDefinitions],
  );
  const updateProvider = useCallback(
    (id: string, patch: Partial<AiProviderDraft>) => {
      setProviders((current) =>
        current.map((profile) => {
          if (profile.id !== id) return profile;
          const providerDefaults =
            patch.provider && patch.provider !== profile.provider
              ? defaultsForProvider(patch.provider, providerDefinitions)
              : {};
          return { ...profile, ...providerDefaults, ...patch };
        }),
      );
    },
    [providerDefinitions],
  );
  const probePayload = useCallback(
    (profile: AiProviderDraft, refresh = false) => ({
      profileId: profile.id,
      provider: profile.provider,
      ...(profile.apiKey ? { apiKey: profile.apiKey } : {}),
      baseUrl: profile.baseUrl.trim() || null,
      model: splitCsv(profile.modelsText)[0] ?? null,
      refresh,
    }),
    [],
  );
  const discoverModels = useCallback(
    async (id: string, refresh = false) => {
      const profile = providers.find((item) => item.id === id);
      if (!profile) return;
      updateProvider(id, { discovering: true, discoveryWarning: undefined });
      try {
        const result = await api.discoverAiProviderModels(
          probePayload(profile, refresh),
        );
        updateProvider(id, {
          discovering: false,
          discoveredModels: result.models,
          discoverySource: result.source,
          discoveryWarning: result.warning,
          ...(!profile.modelsText.trim() && result.models[0]
            ? { modelsText: result.models[0].id }
            : {}),
        });
      } catch (error) {
        updateProvider(id, {
          discovering: false,
          discoveryWarning: api.isAxiosError(error)
            ? (error.response?.data?.message ?? "Model discovery failed")
            : "Model discovery failed",
        });
      }
    },
    [probePayload, providers, updateProvider],
  );
  const testProvider = useCallback(
    async (id: string) => {
      const profile = providers.find((item) => item.id === id);
      if (!profile) return;
      updateProvider(id, { testing: true, testResult: undefined });
      try {
        const result = await api.testAiProviderConnection(
          probePayload(profile),
        );
        updateProvider(id, {
          testing: false,
          testResult: result,
          ...(result.models
            ? { discoveredModels: result.models, discoverySource: "live" }
            : {}),
        });
      } catch (error) {
        updateProvider(id, {
          testing: false,
          testResult: {
            ok: false,
            code: "unreachable",
            message: api.isAxiosError(error)
              ? (error.response?.data?.message ?? "Connection test failed")
              : "Connection test failed",
          },
        });
      }
    },
    [probePayload, providers, updateProvider],
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
      const { payloadProviders, validationFailures } =
        await prepareAiProviderSave(providers, probePayload);
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
      if (validationFailures.length > 0) {
        toast.warning(
          `Saved, but connection validation failed for: ${validationFailures.join(", ")}`,
        );
      } else {
        toast.success("AI providers verified and saved");
      }
    } catch (error) {
      setError(
        api.isAxiosError(error)
          ? (error.response?.data?.message ?? "Failed to save AI settings")
          : "Failed to save AI settings",
      );
    } finally {
      setSaving(false);
    }
  }, [
    applyResponse,
    defaultProviderId,
    probePayload,
    providers,
    saving,
    setError,
  ]);
  useEffect(() => {
    if (authEnabled !== null) void load();
  }, [authEnabled, load]);
  return {
    enabled,
    loading,
    saving,
    providers,
    defaultProviderId,
    status,
    providerDefinitions,
    setDefaultProviderId,
    addProvider,
    updateProvider,
    removeProvider,
    discoverModels,
    testProvider,
    save,
    setEnabled,
  };
};
