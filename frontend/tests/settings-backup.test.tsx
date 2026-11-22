import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Settings } from "../src/pages/Settings";
import * as api from "../src/api";

vi.mock("@excalidraw/excalidraw", () => ({}));
vi.mock("../src/api", () => ({
  api: { get: vi.fn(), post: vi.fn() },
  getCollections: vi.fn(async () => []),
  getUpdateInfo: vi.fn(async () => ({})),
  isAxiosError: (error: { isAxiosError?: boolean }) =>
    error?.isAxiosError === true,
}));
vi.mock("../src/components/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../src/components/ConfirmModal", () => ({
  ConfirmModal: (props: Record<string, unknown>) =>
    React.createElement("test-dialog", props),
}));
vi.mock("../src/pages/settings/SettingsMainGrid", () => ({
  SettingsMainGrid: (props: Record<string, unknown>) =>
    React.createElement("test-settings", props),
}));
vi.mock("../src/pages/settings/AdvancedSettings", () => ({
  AdvancedSettings: () => null,
}));
vi.mock("../src/pages/profile/ApiKeysCard", () => ({
  ApiKeysCard: () => null,
}));
vi.mock("../src/context/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));
vi.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ authEnabled: true, user: null, authMode: "oidc" }),
}));
vi.mock("../src/context/PreferencesContext", () => ({
  usePreference: () => [false, vi.fn()],
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../src/utils/imageCompression", () => ({
  resetImageCompressionMemo: vi.fn(),
}));
vi.mock("sonner", () => ({ Toaster: () => null }));

let renderer: ReactTestRenderer;
let link: { href: string; download: string; click: ReturnType<typeof vi.fn> };
const render = async () => {
  await act(async () => {
    renderer = create(<Settings />);
  });
};
const exportBackup = async () => {
  await act(async () => {
    await renderer.root.findByType("test-settings").props.exportBackup();
  });
  await act(async () => {});
};
const exportDialog = () =>
  renderer.root
    .findAllByType("test-dialog")
    .find((dialog) => dialog.props.isOpen)!;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.api.get).mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  link = { href: "", download: "", click: vi.fn() };
  vi.stubGlobal("window", {
    localStorage: { getItem: () => null, setItem: vi.fn() },
    URL: { createObjectURL: () => "blob:fixture", revokeObjectURL: vi.fn() },
  });
  vi.stubGlobal("document", {
    createElement: () => link,
    body: { appendChild: vi.fn(), removeChild: vi.fn() },
  });
});
afterEach(() => {
  act(() => renderer?.unmount());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("backup export dialogs", () => {
  it("labels a generic export failure correctly and retains the import error title", async () => {
    vi.mocked(api.api.get).mockRejectedValue(new Error("network offline"));
    await render();
    await exportBackup();
    expect(exportDialog().props.title).toBe("Backup Export Failed");
    expect(exportDialog().props.message).toBe(
      "Failed to export backup. Please try again.",
    );
    expect(exportDialog().props.confirmText).toBe("OK");
    const importDialog = renderer.root
      .findAllByType("test-dialog")
      .find((dialog) => dialog.props.title === "Backup Import Failed")!;
    expect(importDialog.props.isOpen).toBe(false);
    expect(link.click).not.toHaveBeenCalled();
  });

  it("reads blob JSON errors and requires an explicit choice for an incomplete recovery copy", async () => {
    const message =
      "Some drawing images have no stored bytes. This recovery copy is incomplete.";
    vi.mocked(api.api.get)
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: {
          status: 409,
          data: new Blob(
            [JSON.stringify({ code: "BACKUP_MISSING_IMAGES", message })],
            { type: "application/json" },
          ),
        },
      })
      .mockResolvedValueOnce({
        data: new Blob(["fixture archive"]),
        headers: { "x-excalidash-missing-images": "4" },
      });
    await render();
    await exportBackup();
    expect(exportDialog().props.title).toBe("Backup Export Failed");
    expect(exportDialog().props.message).toBe(message);
    expect(exportDialog().props.confirmText).toBe("Export Recovery Copy");
    expect(api.api.get).toHaveBeenCalledTimes(1);
    expect(link.click).not.toHaveBeenCalled();
    await act(async () => {
      exportDialog().props.onConfirm();
    });
    await act(async () => {});
    expect(api.api.get).toHaveBeenLastCalledWith("/export/excalidash", {
      responseType: "blob",
      params: { recovery: "1" },
    });
    expect(link.click).toHaveBeenCalledOnce();
    expect(link.download).toMatch(/^excalidash-recovery-.*\.excalidash$/);
    expect(exportDialog().props.title).toBe("Recovery Copy Exported");
    expect(exportDialog().props.message).toContain("4 missing image(s)");
    expect(exportDialog().props.message).toContain("incomplete backup");
  });

  it("does not offer recovery for a storage outage or malformed blob error", async () => {
    vi.mocked(api.api.get).mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: new Blob(["not JSON"]) },
    });
    await render();
    await exportBackup();
    expect(exportDialog().props.title).toBe("Backup Export Failed");
    expect(exportDialog().props.confirmText).toBe("OK");
    expect(api.api.get).toHaveBeenCalledTimes(1);
  });
});
