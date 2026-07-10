import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserPreferences } from "../../api";
import { NewDrawingControl } from "./NewDrawingControl";

const state = vi.hoisted(() => ({
  preferences: {} as UserPreferences,
}));

vi.mock("../../context/PreferencesContext", () => ({
  usePreferences: () => ({
    preferences: state.preferences,
    updatePreferences: vi.fn(),
    setPreference: vi.fn(),
  }),
}));

describe("NewDrawingControl", () => {
  beforeEach(() => {
    state.preferences = {};
  });

  it("opens the two-card picker when no default engine is set", () => {
    const onCreate = vi.fn();
    render(<NewDrawingControl disabled={false} onCreate={onCreate} />);

    fireEvent.click(screen.getByText("New Drawing"));

    // Both engine cards are offered.
    expect(screen.getByTestId("engine-card-excalidraw")).toBeTruthy();
    const tldrawCard = screen.getByTestId("engine-card-tldraw");
    fireEvent.click(tldrawCard);

    expect(onCreate).toHaveBeenCalledWith("tldraw");
  });

  it("creates with the stored default directly and offers the other engine in the menu", () => {
    state.preferences = { defaultEngine: "excalidraw" };
    const onCreate = vi.fn();
    render(<NewDrawingControl disabled={false} onCreate={onCreate} />);

    // Primary button creates with the default, no dialog.
    fireEvent.click(screen.getByText("New Drawing"));
    expect(onCreate).toHaveBeenCalledWith("excalidraw");
    expect(screen.queryByTestId("engine-card-tldraw")).toBeNull();

    // Dropdown offers the non-default engine only.
    fireEvent.click(screen.getByLabelText("Choose engine"));
    expect(screen.queryByTestId("new-drawing-engine-excalidraw")).toBeNull();
    fireEvent.click(screen.getByTestId("new-drawing-engine-tldraw"));
    expect(onCreate).toHaveBeenLastCalledWith("tldraw");
  });

  it("does not create while disabled", () => {
    const onCreate = vi.fn();
    render(<NewDrawingControl disabled onCreate={onCreate} />);

    fireEvent.click(screen.getByText("New Drawing"));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.queryByTestId("engine-card-excalidraw")).toBeNull();
  });
});
