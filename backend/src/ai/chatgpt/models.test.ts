import { describe, expect, it } from "vitest";
import {
  mergeChatGptModels,
  reasoningEffortsForChatGptModel,
  type ChatGptModel,
} from "./models";

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

  it("keeps configured models when the live catalog omits them", () => {
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

    expect(mergeChatGptModels(configured, live)).toEqual([
      configured[0],
      live[0],
    ]);
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
});
