import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearChatGptModelCacheForTests,
  fetchChatGptModels,
  mergeChatGptModels,
  reasoningEffortsForChatGptModel,
  type ChatGptModel,
} from "./models";

afterEach(() => {
  clearChatGptModelCacheForTests();
  vi.restoreAllMocks();
});

describe("ChatGPT model catalog", () => {
  it("exposes every supported GPT-5.6 reasoning effort", () => {
    expect(reasoningEffortsForChatGptModel("gpt-5.6-terra")).toEqual([
      "none",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
  });

  it("does not offer configured models omitted by the live account catalog", () => {
    const configured: ChatGptModel[] = [
      {
        id: "gpt-5.6-luna",
        label: "gpt-5.6-luna",
        reasoningEfforts: reasoningEffortsForChatGptModel("gpt-5.6-luna"),
      },
    ];
    const live: ChatGptModel[] = [
      { id: "gpt-5.5", label: "GPT-5.5", reasoningEfforts: ["low"] },
    ];

    expect(mergeChatGptModels(configured, live)).toEqual([live[0]]);
  });

  it("prefers live labels and capabilities for registered models", () => {
    const configured: ChatGptModel[] = [
      { id: "gpt-5.6-sol", label: "gpt-5.6-sol", reasoningEfforts: ["low"] },
    ];
    const live: ChatGptModel[] = [
      { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", reasoningEfforts: ["max"] },
    ];

    expect(mergeChatGptModels(configured, live)).toEqual(live);
  });

  it("keeps registered reasoning levels when live metadata omits them", () => {
    const configured: ChatGptModel[] = [
      {
        id: "gpt-5.6-terra",
        label: "gpt-5.6-terra",
        reasoningEfforts: ["none", "low", "max"],
      },
    ];
    const live: ChatGptModel[] = [
      { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", reasoningEfforts: [] },
    ];

    expect(mergeChatGptModels(configured, live)[0]).toEqual({
      ...live[0],
      reasoningEfforts: configured[0].reasoningEfforts,
    });
  });

  it("includes none for current GPT-5.4 family fallback models", () => {
    expect(reasoningEffortsForChatGptModel("gpt-5.4-mini")).toContain("none");
  });

  it("caches the per-account live catalog", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        models: [{
          slug: "gpt-5.6-sol",
          display_name: "GPT-5.6 Sol",
          supported_in_api: true,
          visibility: "list",
          supported_reasoning_levels: [{ effort: "high" }],
        }],
      }), { status: 200 }),
    );
    const auth = { accessToken: "token", accountId: "account" };
    await fetchChatGptModels(auth);
    await fetchChatGptModels(auth);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
