import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NewDrawingControl } from "./NewDrawingControl";

describe("NewDrawingControl", () => {
  it("creates an excalidraw drawing directly, no engine picker", () => {
    const onCreate = vi.fn();
    render(<NewDrawingControl disabled={false} onCreate={onCreate} />);

    expect(screen.queryByTestId("engine-card-excalidraw")).toBeNull();
    expect(screen.queryByTestId("engine-card-tldraw")).toBeNull();

    fireEvent.click(screen.getByText("New Drawing"));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("does not create while disabled", () => {
    const onCreate = vi.fn();
    render(<NewDrawingControl disabled onCreate={onCreate} />);

    fireEvent.click(screen.getByText("New Drawing"));
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("aborts when the canCreate gate returns false", () => {
    const onCreate = vi.fn();
    render(
      <NewDrawingControl
        disabled={false}
        onCreate={onCreate}
        canCreate={() => false}
      />,
    );

    fireEvent.click(screen.getByText("New Drawing"));
    expect(onCreate).not.toHaveBeenCalled();
  });
});
