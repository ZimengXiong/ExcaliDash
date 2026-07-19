import * as api from "../../api";
import type { AiProviderProbe } from "../../api/ai";
import type { AiProviderDraft } from "./useAiSettings";

const splitCsv = (value: string): string[] => [
  ...new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ),
];

export const prepareAiProviderSave = async (
  providers: AiProviderDraft[],
  probePayload: (
    profile: AiProviderDraft,
    refresh?: boolean,
  ) => AiProviderProbe,
) => {
  const validationResults = await Promise.all(
    providers.map(async (profile) => {
      if (profile.provider === "chatgpt" || !profile.enabled) {
        return { profile, result: null };
      }
      try {
        return {
          profile,
          result: await api.testAiProviderConnection(
            probePayload(profile, true),
          ),
        };
      } catch (error) {
        return {
          profile,
          result: {
            ok: false,
            code: "unreachable" as const,
            message: api.isAxiosError(error)
              ? (error.response?.data?.message ?? "Connection test failed")
              : "Connection test failed",
            models: undefined,
          },
        };
      }
    }),
  );
  const validationById = new Map(
    validationResults.map(({ profile, result }) => [profile.id, result]),
  );

  const payloadProviders = providers.map((profile) => {
    const isChatGpt = profile.provider === "chatgpt";
    const isCustom = profile.provider === "custom";
    const validation = validationById.get(profile.id);
    const customModelIds = isChatGpt
      ? []
      : splitCsv(isCustom ? profile.modelsText : profile.customModelsText);
    const customModels = customModelIds.map((id) => ({
      id,
      label: id,
      reasoningEfforts: [] as string[],
    }));
    const catalogModels =
      validation?.models && validation.models.length > 0
        ? validation.models
        : profile.discoveredModels;
    const catalogById = new Map(
      catalogModels.map((model) => [model.id, model]),
    );
    const models = isChatGpt
      ? []
      : [
          ...catalogModels,
          ...customModels.filter((model) => !catalogById.has(model.id)),
        ];
    if (models.length === 0) {
      models.push(
        ...splitCsv(profile.modelsText).map((id) => ({
          id,
          label: id,
          reasoningEfforts: splitCsv(profile.reasoningEffortsText),
        })),
      );
    }
    return {
      id: profile.id,
      label: profile.label.trim() || profile.id,
      provider: profile.provider,
      enabled: profile.enabled,
      baseUrl:
        isChatGpt || !isCustom ? null : profile.baseUrl.trim() || null,
      models,
      customModels,
      ...(!isChatGpt && profile.apiKey ? { apiKey: profile.apiKey } : {}),
      ...(profile.clearApiKey ? { clearApiKey: true } : {}),
    };
  });

  return {
    payloadProviders,
    validationFailures: validationResults
      .filter(({ result }) => result && !result.ok)
      .map(({ profile }) => profile.label),
  };
};
