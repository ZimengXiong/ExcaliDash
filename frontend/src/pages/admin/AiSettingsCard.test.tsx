import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AiSettingsCard } from "./AiSettingsCard";

const renderCard = (enabled: boolean, onEnabledChange = vi.fn()) =>
  render(
    <AiSettingsCard
      loading={false}
      saving={false}
      enabled={enabled}
      provider="anthropic"
      baseUrl="https://api.anthropic.com/v1"
      model="preserved-model"
      apiKey=""
      chatgptEnabled
      status={null}
      envKeyConfigured={false}
      dbKeyConfigured
      onEnabledChange={onEnabledChange}
      onProviderChange={vi.fn()}
      onBaseUrlChange={vi.fn()}
      onModelChange={vi.fn()}
      onApiKeyChange={vi.fn()}
      onChatgptEnabledChange={vi.fn()}
      onSave={vi.fn()}
      onClearDbKey={vi.fn()}
    />,
  );

describe("AiSettingsCard global feature switch", () => {
  it("keeps only the global switch visible when disabled", () => {
    renderCard(false);
    expect(screen.getByLabelText("Enable AI features")).toBeInTheDocument();
    expect(screen.queryByText("Provider")).not.toBeInTheDocument();
    expect(screen.queryByText("Model")).not.toBeInTheDocument();
    expect(screen.queryByText("API key")).not.toBeInTheDocument();
    expect(screen.queryByText("Save AI settings")).not.toBeInTheDocument();
  });

  it("can re-enable the feature and restores provider controls when enabled", () => {
    const onEnabledChange = vi.fn();
    const { rerender } = renderCard(false, onEnabledChange);
    fireEvent.click(screen.getByLabelText("Enable AI features"));
    expect(onEnabledChange).toHaveBeenCalledWith(true);

    rerender(
      <AiSettingsCard
        loading={false}
        saving={false}
        enabled
        provider="anthropic"
        baseUrl=""
        model="preserved-model"
        apiKey=""
        chatgptEnabled
        status={null}
        envKeyConfigured={false}
        dbKeyConfigured
        onEnabledChange={onEnabledChange}
        onProviderChange={vi.fn()}
        onBaseUrlChange={vi.fn()}
        onModelChange={vi.fn()}
        onApiKeyChange={vi.fn()}
        onChatgptEnabledChange={vi.fn()}
        onSave={vi.fn()}
        onClearDbKey={vi.fn()}
      />,
    );
    expect(screen.getByText("Provider")).toBeInTheDocument();
    expect(screen.getByDisplayValue("preserved-model")).toBeInTheDocument();
  });
});
