import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AiProviderDefinition } from "../../api/ai";
import { AiSettingsCard } from "./AiSettingsCard";
import type { AiProviderDraft } from "./useAiSettings";

const definitions: AiProviderDefinition[] = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.4",
    protocol: "openai-chat-completions",
    discovery: "live",
    help: "OpenAI help",
  },
  {
    id: "opencode_go",
    label: "OpenCode Go",
    baseUrl: "https://opencode.ai/zen/go/v1",
    defaultModel: "kimi-k3",
    protocol: "mixed",
    discovery: "live",
    help: "OpenCode help",
  },
];

const profile: AiProviderDraft = {
  id: "draft",
  label: "OpenAI",
  provider: "openai",
  enabled: true,
  baseUrl: "",
  modelsText: "manual-model",
  customModelsText: "",
  reasoningEffortsText: "",
  apiKey: "",
  keyConfigured: true,
  keySource: "db",
  discoveredModels: [
    { id: "manual-model", label: "Manual model", reasoningEfforts: [] },
    { id: "gpt-5.4", label: "GPT-5.4", reasoningEfforts: ["medium"] },
  ],
  discoverySource: "cache",
};

describe("AiSettingsCard", () => {
  it("keeps known providers key-only and puts custom model IDs in Advanced", () => {
    const onUpdateProvider = vi.fn();
    render(
      <AiSettingsCard
        enabled
        loading={false}
        saving={false}
        providers={[profile]}
        providerDefinitions={definitions}
        defaultProviderId="draft"
        status={null}
        onDefaultProviderChange={vi.fn()}
        onAddProvider={vi.fn()}
        onUpdateProvider={onUpdateProvider}
        onRemoveProvider={vi.fn()}
        onSave={vi.fn()}
        onEnabledChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    expect(screen.getByLabelText("OpenAI API key")).toBeInTheDocument();
    expect(screen.queryByText("Base URL")).not.toBeInTheDocument();
    expect(screen.queryByText("Provider tools")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Advanced"));
    fireEvent.change(screen.getByLabelText("Custom model names"), {
      target: { value: "future-model" },
    });
    expect(onUpdateProvider).toHaveBeenCalledWith("draft", {
      customModelsText: "future-model",
    });
  });

  it("sets the provider type per provider from the editor", () => {
    const onUpdateProvider = vi.fn();
    render(
      <AiSettingsCard
        enabled
        loading={false}
        saving={false}
        providers={[profile]}
        providerDefinitions={definitions}
        defaultProviderId="draft"
        status={null}
        onDefaultProviderChange={vi.fn()}
        onAddProvider={vi.fn()}
        onUpdateProvider={onUpdateProvider}
        onRemoveProvider={vi.fn()}
        onSave={vi.fn()}
        onEnabledChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    fireEvent.click(screen.getByRole("button", { name: "Provider type" }));
    fireEvent.click(screen.getByRole("option", { name: "OpenCode Go" }));
    expect(onUpdateProvider).toHaveBeenCalledWith("draft", {
      provider: "opencode_go",
    });
  });

  it("keeps the global switch available while provider controls are disabled", () => {
    const onEnabledChange = vi.fn();
    render(
      <AiSettingsCard
        enabled={false}
        loading={false}
        saving={false}
        providers={[profile]}
        providerDefinitions={definitions}
        defaultProviderId="draft"
        status={null}
        onDefaultProviderChange={vi.fn()}
        onAddProvider={vi.fn()}
        onUpdateProvider={vi.fn()}
        onRemoveProvider={vi.fn()}
        onSave={vi.fn()}
        onEnabledChange={onEnabledChange}
      />,
    );
    expect(screen.getByLabelText("Enable AI features")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Test connection" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Enable AI features"));
    expect(onEnabledChange).toHaveBeenCalledWith(true);
  });

  it("shows the registry without mutation controls to non-admin users", () => {
    render(
      <AiSettingsCard
        readOnly
        enabled
        loading={false}
        saving={false}
        providers={[profile]}
        providerDefinitions={definitions}
        defaultProviderId="draft"
        status={null}
        onDefaultProviderChange={vi.fn()}
        onAddProvider={vi.fn()}
        onUpdateProvider={vi.fn()}
        onRemoveProvider={vi.fn()}
        onSave={vi.fn()}
        onEnabledChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Admin managed")).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit details" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add provider" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Enable AI features")).toBeDisabled();
  });
});
