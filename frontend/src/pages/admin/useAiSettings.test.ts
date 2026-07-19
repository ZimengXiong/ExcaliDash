import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { toast } from "sonner";
import { useAiSettings } from "./useAiSettings";

vi.mock("../../api", () => ({
  api: {
    put: vi.fn(),
  },
  isAxiosError: vi.fn(() => false),
  testAiProviderConnection: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

const liveModels = [
  { id: "gemini-pro", label: "Gemini Pro", reasoningEfforts: ["high"] },
  { id: "gemini-flash", label: "Gemini Flash", reasoningEfforts: ["low"] },
];

describe("useAiSettings save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates known providers and saves the full live catalog plus custom IDs", async () => {
    vi.mocked(api.testAiProviderConnection).mockResolvedValue({
      ok: true,
      code: "success",
      message: "Connected",
      models: liveModels,
    });
    vi.mocked(api.api.put).mockResolvedValue({
      data: {
        status: {
          enabled: true,
          available: true,
          provider: "gemini",
          model: "gemini-pro",
          keyConfigured: true,
          keySource: "db",
          chatgptEnabled: false,
          defaultProviderId: "provider",
          providers: [],
        },
        providers: [],
        defaultProviderId: null,
        providerDefinitions: [],
      },
    });

    const { result } = renderHook(() =>
      useAiSettings({
        authEnabled: null,
        setError: vi.fn(),
      }),
    );

    act(() => result.current.addProvider("gemini"));
    const id = result.current.providers[0].id;
    act(() =>
      result.current.updateProvider(id, {
        label: "Google Gemini",
        apiKey: "secret",
        modelsText: "gemini-fallback",
        customModelsText: "gemini-future",
      }),
    );
    await act(async () => {
      await result.current.save();
    });

    const settingsCall = vi
      .mocked(api.api.put)
      .mock.calls.find(([path]) => path === "/auth/ai/settings");
    expect(settingsCall).toBeDefined();
    const payload = settingsCall?.[1] as {
      providers: Array<{
        baseUrl: string | null;
        models: Array<{ id: string }>;
        customModels: Array<{ id: string }>;
      }>;
    };
    expect(payload.providers[0].baseUrl).toBeNull();
    expect(payload.providers[0].models.map((model) => model.id)).toEqual([
      "gemini-pro",
      "gemini-flash",
      "gemini-future",
    ]);
    expect(payload.providers[0].customModels).toEqual([
      {
        id: "gemini-future",
        label: "gemini-future",
        reasoningEfforts: [],
      },
    ]);
    expect(toast.success).toHaveBeenCalledWith(
      "AI providers verified and saved",
    );
  });

  it("saves with a warning when provider validation fails", async () => {
    vi.mocked(api.testAiProviderConnection).mockResolvedValue({
      ok: false,
      code: "authentication_failure",
      message: "Authentication failed",
    });
    vi.mocked(api.api.put).mockResolvedValue({
      data: {
        status: {
          enabled: true,
          available: false,
          provider: "gemini",
          model: null,
          keyConfigured: false,
          keySource: null,
          chatgptEnabled: false,
          defaultProviderId: null,
          providers: [],
        },
        providers: [],
        defaultProviderId: null,
        providerDefinitions: [],
      },
    });

    const { result } = renderHook(() =>
      useAiSettings({
        authEnabled: null,
        setError: vi.fn(),
      }),
    );
    act(() => result.current.addProvider("gemini"));
    const id = result.current.providers[0].id;
    act(() =>
      result.current.updateProvider(id, {
        label: "Google Gemini",
        apiKey: "bad-key",
        modelsText: "gemini-fallback",
      }),
    );
    await act(async () => {
      await result.current.save();
    });

    expect(toast.warning).toHaveBeenCalledWith(
      "Saved, but connection validation failed for: Google Gemini",
    );
  });
});
