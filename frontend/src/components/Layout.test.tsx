import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("./Sidebar", () => ({
  Sidebar: () => <div data-testid="sidebar">sidebar</div>,
}));

vi.mock("./Logo", () => ({
  Logo: () => <div data-testid="logo">logo</div>,
}));

vi.mock("./UploadStatus", () => ({
  UploadStatus: () => <div data-testid="upload-status">upload-status</div>,
}));

vi.mock("./ImpersonationBanner", () => ({
  ImpersonationBanner: () => null,
}));

import { Layout } from "./Layout";

describe("Layout", () => {
  it("removes active resize listeners on unmount", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");

    const { unmount } = render(
      <MemoryRouter>
        <Layout
          collections={[]}
          selectedCollectionId={undefined}
          onSelectCollection={() => {}}
          onCreateCollection={() => {}}
          onEditCollection={() => {}}
          onDeleteCollection={() => {}}
        >
          <div>content</div>
        </Layout>
      </MemoryRouter>,
    );

    fireEvent.mouseDown(screen.getByTitle("Drag to resize sidebar"));

    const mouseMoveAdd = addSpy.mock.calls.find(
      ([event]) => event === "mousemove",
    );
    const mouseUpAdd = addSpy.mock.calls.find(([event]) => event === "mouseup");

    expect(mouseMoveAdd?.[1]).toBeTypeOf("function");
    expect(mouseUpAdd?.[1]).toBeTypeOf("function");

    unmount();

    expect(
      removeSpy.mock.calls.some(
        ([event, handler]) =>
          event === "mousemove" && handler === mouseMoveAdd?.[1],
      ),
    ).toBe(true);
    expect(
      removeSpy.mock.calls.some(
        ([event, handler]) =>
          event === "mouseup" && handler === mouseUpAdd?.[1],
      ),
    ).toBe(true);
  });
});
