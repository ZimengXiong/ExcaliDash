import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AISidebar } from "../src/pages/editor/AISidebar";
import { applyAiOperations } from "../src/pages/editor/aiOperations";
import * as api from "../src/api";

vi.mock("../src/api", () => ({
  API_URL: "/api",
  getAiConversation: vi.fn(),
  streamAiMessage: vi.fn(),
  clearAiConversation: vi.fn(),
  isAxiosError: () => false,
}));
vi.mock("../src/pages/editor/aiOperations", () => ({
  applyAiOperations: vi.fn(),
}));

const renderers: ReactTestRenderer[] = [];
const editor = { current: { updateScene: vi.fn() } };

const render = async (element: React.ReactElement) => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(element);
  });
  renderers.push(renderer);
  return renderer;
};

const renderOpenSidebar = async () =>
  render(
    <AISidebar
      isOpen
      onClose={vi.fn()}
      drawingId="drawing"
      canEdit
      excalidrawAPI={editor}
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getAiConversation).mockResolvedValue({
    conversationId: "conversation",
    messages: [],
  });
});

afterEach(async () => {
  await act(async () => {
    renderers.splice(0).forEach((renderer) => renderer.unmount());
  });
  vi.unstubAllGlobals();
});

describe("AI sidebar", () => {
  it("stays hidden when closed", async () => {
    const renderer = await render(
      <AISidebar
        isOpen={false}
        onClose={vi.fn()}
        drawingId="drawing"
        canEdit
        excalidrawAPI={editor}
      />,
    );
    expect(renderer.root.findAllByType("aside")).toHaveLength(0);
  });

  it("closes from the close button and Escape key", async () => {
    const onClose = vi.fn();
    const renderer = await render(
      <AISidebar
        isOpen
        onClose={onClose}
        drawingId="drawing"
        canEdit
        excalidrawAPI={editor}
      />,
    );
    const sidebar = renderer.root.findByProps({ "aria-label": "AI assistant" });

    await act(async () => {
      renderer.root
        .findByProps({ "aria-label": "Close AI assistant" })
        .props.onClick();
    });
    expect(onClose).toHaveBeenCalledOnce();

    await act(async () => {
      sidebar.props.onKeyDown({ key: "Escape" });
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("synchronizes saved messages and clearing through SSE", async () => {
    const connections: Array<{
      url: string;
      onmessage: ((event: { data: string }) => void) | null;
      close: ReturnType<typeof vi.fn>;
    }> = [];
    vi.stubGlobal(
      "EventSource",
      class {
        onmessage: ((event: { data: string }) => void) | null = null;
        close = vi.fn();
        constructor(public url: string) {
          connections.push(this);
        }
      },
    );
    const renderer = await renderOpenSidebar();
    expect(connections[0].url).toBe("/api/drawings/drawing/ai/events");

    await act(async () => {
      connections[0].onmessage?.({
        data: JSON.stringify({
          type: "snapshot",
          job: { id: "job", reasoning: "Shared live reasoning" },
        }),
      });
    });
    expect(
      renderer.root.findByProps({ "aria-label": "Send message" }).props
        .disabled,
    ).toBe(true);
    expect(
      renderer.root.findAll((node) =>
        node.children.includes("Shared live reasoning"),
      ).length,
    ).toBeGreaterThan(0);
    await act(async () => {
      connections[0].onmessage?.({
        data: JSON.stringify({ type: "status", status: "idle", jobId: "job" }),
      });
    });

    const incoming = {
      id: "saved-user",
      role: "user",
      content: "From another window",
      createdAt: "2026-11-14T00:00:00Z",
    };
    await act(async () => {
      connections[0].onmessage?.({
        data: JSON.stringify({ type: "messages", messages: [incoming] }),
      });
    });
    expect(
      renderer.root.findAll((node) =>
        node.children.includes("From another window"),
      ).length,
    ).toBeGreaterThan(0);

    await act(async () => {
      connections[0].onmessage?.({ data: JSON.stringify({ type: "cleared" }) });
    });
    expect(
      renderer.root.findAll((node) =>
        node.children.includes("From another window"),
      ),
    ).toHaveLength(0);
  });

  it("loads shared history, sends a message, and applies board operations", async () => {
    const operations = [
      {
        type: "create" as const,
        elements: [{ type: "rectangle", x: 10, y: 20 }],
      },
    ];
    vi.mocked(api.streamAiMessage).mockImplementation(
      async (_drawingId, _message, onReasoning) => {
        onReasoning("I should ");
        onReasoning("add one rectangle.");
        return {
          conversationId: "conversation",
          messages: [
            {
              id: "user-1",
              role: "user",
              content: "Add a rectangle",
              createdAt: "2026-11-14T00:00:00Z",
            },
            {
              id: "assistant-1",
              role: "assistant",
              content: "Done",
              reasoning: "I should add one rectangle.",
              createdAt: "2026-11-14T00:00:01Z",
            },
          ],
          operations,
        };
      },
    );
    const renderer = await renderOpenSidebar();
    expect(api.getAiConversation).toHaveBeenCalledWith("drawing");

    await act(async () => {
      renderer.root
        .findByProps({ "aria-label": "Message AI assistant" })
        .props.onChange({ target: { value: "Add a rectangle" } });
    });
    await act(async () => {
      await renderer.root.findByType("form").props.onSubmit({
        preventDefault: vi.fn(),
      });
    });

    expect(api.streamAiMessage).toHaveBeenCalledWith(
      "drawing",
      "Add a rectangle",
      expect.any(Function),
    );
    expect(applyAiOperations).toHaveBeenCalledWith(editor.current, operations);
    expect(
      renderer.root.findAll((node) => node.children.includes("Done")).length,
    ).toBeGreaterThan(0);
    const thinkingButton = renderer.root.findByProps({
      "aria-label": "Toggle AI thinking",
    });
    expect(thinkingButton.props["aria-expanded"]).toBe(false);
    await act(async () => thinkingButton.props.onClick());
    expect(
      renderer.root.findByProps({ "aria-label": "Toggle AI thinking" }).props[
        "aria-expanded"
      ],
    ).toBe(true);
    expect(
      renderer.root.findAll((node) =>
        node.children.includes("I should add one rectangle."),
      ).length,
    ).toBeGreaterThan(0);
  });
});
