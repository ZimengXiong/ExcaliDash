import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdvancedSettings } from "./AdvancedSettings";

vi.mock("../../utils/importUtils", () => ({
  importLegacyFiles: vi.fn(),
}));

const renderSettings = () => {
  const verifyLegacyDbFile = vi.fn().mockResolvedValue(undefined);
  const setImportError = vi.fn();
  const view = render(
    <AdvancedSettings
      authEnabled
      authMode="local"
      authToggleLoading={false}
      backupImportLoading={false}
      legacyDbImportLoading={false}
      isManagedAuthMode={false}
      user={{ role: "ADMIN" }}
      appVersion="test"
      buildLabel={undefined}
      verifyBackupFile={vi.fn()}
      verifyLegacyDbFile={verifyLegacyDbFile}
      confirmToggleAuthEnabled={vi.fn()}
      setImportError={setImportError}
      setImportSuccess={vi.fn()}
    />,
  );
  const input = view.container.querySelector<HTMLInputElement>(
    "#settings-import-legacy",
  );
  if (!input) throw new Error("Legacy import input is missing");
  return { input, setImportError, verifyLegacyDbFile };
};

describe("AdvancedSettings legacy import", () => {
  it("routes a standalone SQLite database through server verification", async () => {
    const { input, verifyLegacyDbFile } = renderSettings();
    const database = new File(["sqlite"], "legacy.db");

    fireEvent.change(input, { target: { files: [database] } });

    expect(verifyLegacyDbFile).toHaveBeenCalledWith(database);
  });

  it("rejects a database mixed with drawing files", () => {
    const { input, setImportError, verifyLegacyDbFile } = renderSettings();

    fireEvent.change(input, {
      target: {
        files: [
          new File(["sqlite"], "legacy.sqlite"),
          new File(["{}"], "drawing.excalidraw"),
        ],
      },
    });

    expect(verifyLegacyDbFile).not.toHaveBeenCalled();
    expect(setImportError).toHaveBeenCalledWith({
      isOpen: true,
      message: "Import legacy database files separately from other files.",
    });
  });
});
