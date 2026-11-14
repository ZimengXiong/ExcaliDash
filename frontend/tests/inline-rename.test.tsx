import React, { useLayoutEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InlineEditInput } from "../src/components/InlineEditInput";
import { SidebarItem } from "../src/components/sidebar/SidebarItem";
import { DrawingCard } from "../src/components/DrawingCard";
import { EditorView } from "../src/pages/editor/EditorView";
import { useEditorCommands } from "../src/pages/editor/useEditorCommands";
import * as api from "../src/api";

vi.mock("@excalidraw/excalidraw", () => {
  const Item = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  return {
    Excalidraw: () => null,
    MainMenu: Object.assign(Item, {
      Item,
      ItemCustom: Item,
      Separator: () => null,
      DefaultItems: {},
    }),
    exportToSvg: vi.fn(),
  };
});
vi.mock("../src/api", () => ({
  isS3Enabled: vi.fn(async () => false),
  isAxiosError: () => false,
  updateDrawing: vi.fn(async () => ({ version: 2 })),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../src/components/drawing-card/useDrawingPreview", () => ({
  useDrawingPreview: () => ({
    previewSvg: null,
    previewContainerRef: { current: null },
  }),
}));
vi.mock("../src/components/drawing-card/DrawingCardContextMenu", () => ({
  DrawingCardContextMenu: () => null,
}));
vi.mock("../src/components/drawing-card/CollectionPicker", () => ({
  CollectionPicker: () => null,
}));
vi.mock("../src/components/StorageManageModal", () => ({
  StorageManageModal: () => null,
}));
vi.mock("../src/components/ShareModal", () => ({ ShareModal: () => null }));
vi.mock("../src/components/LanguageSelector", () => ({
  LanguageSelector: () => null,
}));
vi.mock("../src/components/GridStepSelector", () => ({
  GridStepSelector: () => null,
}));
vi.mock("../src/pages/editor/HistoryPreviewCanvas", () => ({
  HistoryPreviewCanvas: () => null,
}));

const renderers: ReactTestRenderer[] = [];
async function render(node: React.ReactElement) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(node);
  });
  renderers.push(renderer);
  return renderer;
}

beforeEach(() => {
  vi.stubGlobal("document", {
    body: {},
    title: "",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});
afterEach(async () => {
  await act(async () => {
    renderers.splice(0).forEach((renderer) => renderer.unmount());
  });
  vi.unstubAllGlobals();
});

const key = (name: string, extra: Record<string, unknown> = {}) => ({
  key: name,
  defaultPrevented: false,
  nativeEvent: { isComposing: false },
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  ...extra,
});

function input(renderer: ReactTestRenderer) {
  return renderer.root.findByType("input");
}

describe("InlineEditInput", () => {
  async function setup() {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    const renderer = await render(
      <InlineEditInput
        value="x"
        onChange={vi.fn()}
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    );
    return { renderer, onCommit, onCancel };
  }

  it("commits when focus leaves the input", async () => {
    const { renderer, onCommit, onCancel } = await setup();
    input(renderer).props.onBlur();
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("commits on Enter and does not commit again on the following blur", async () => {
    const { renderer, onCommit } = await setup();
    const event = key("Enter");
    input(renderer).props.onKeyDown(event);
    input(renderer).props.onBlur();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it("cancels on Escape and does not commit on the following blur", async () => {
    const { renderer, onCommit, onCancel } = await setup();
    const event = key("Escape");
    input(renderer).props.onKeyDown(event);
    input(renderer).props.onBlur();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("ignores Enter that confirms an IME composition", async () => {
    const { renderer, onCommit } = await setup();
    input(renderer).props.onKeyDown(
      key("Enter", { nativeEvent: { isComposing: true } }),
    );
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("starts fresh for every new edit", async () => {
    const onCommit = vi.fn();
    const Host = ({ editing }: { editing: boolean }) =>
      editing ? (
        <InlineEditInput
          value="x"
          onChange={vi.fn()}
          onCommit={onCommit}
          onCancel={vi.fn()}
        />
      ) : null;
    const renderer = await render(<Host editing />);
    input(renderer).props.onBlur();
    await act(async () => renderer.update(<Host editing={false} />));
    await act(async () => renderer.update(<Host editing />));
    input(renderer).props.onBlur();
    expect(onCommit).toHaveBeenCalledTimes(2);
  });
});

describe("collection rename in the sidebar", () => {
  it("wires blur to commit and Escape to cancel", async () => {
    const onEditCommit = vi.fn();
    const onEditCancel = vi.fn();
    const renderer = await render(
      <SidebarItem
        id="c1"
        icon={null}
        label="Work"
        isActive={false}
        onClick={vi.fn()}
        isEditing
        editValue="Renamed"
        onEditChange={vi.fn()}
        onEditCommit={onEditCommit}
        onEditCancel={onEditCancel}
      />,
    );
    input(renderer).props.onBlur();
    expect(onEditCommit).toHaveBeenCalledOnce();

    const escaped = await render(
      <SidebarItem
        id="c1"
        icon={null}
        label="Work"
        isActive={false}
        onClick={vi.fn()}
        isEditing
        editValue="Renamed"
        onEditChange={vi.fn()}
        onEditCommit={onEditCommit}
        onEditCancel={onEditCancel}
      />,
    );
    input(escaped).props.onKeyDown(key("Escape"));
    input(escaped).props.onBlur();
    expect(onEditCancel).toHaveBeenCalledOnce();
    expect(onEditCommit).toHaveBeenCalledOnce();
  });
});

describe("drawing card rename", () => {
  const drawing = {
    id: "d1",
    name: "Old name",
    collectionId: null,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    preview: null,
    accessLevel: "owner",
  } as never;

  async function startRename() {
    const onRename = vi.fn();
    const renderer = await render(
      <DrawingCard
        drawing={drawing}
        collections={[]}
        isSelected={false}
        onToggleSelection={vi.fn()}
        onRename={onRename}
        onDelete={vi.fn()}
        onMoveToCollection={vi.fn()}
        onDuplicate={vi.fn()}
        onClick={vi.fn()}
      />,
    );
    await act(async () => {
      renderer.root
        .findByType("h3")
        .props.onDoubleClick({ stopPropagation: vi.fn() });
    });
    return { renderer, onRename };
  }

  async function type(renderer: ReactTestRenderer, value: string) {
    await act(async () => {
      input(renderer).props.onChange({ target: { value } });
    });
  }

  it("saves the trimmed name when clicking away", async () => {
    const { renderer, onRename } = await startRename();
    await type(renderer, "  New name  ");
    await act(async () => input(renderer).props.onBlur());
    expect(onRename).toHaveBeenCalledExactlyOnceWith("d1", "New name");
    expect(renderer.root.findAllByType("input")).toHaveLength(0);
  });

  it("saves once when Enter is followed by blur", async () => {
    const { renderer, onRename } = await startRename();
    await type(renderer, "New name");
    const field = input(renderer);
    await act(async () => {
      field.props.onKeyDown(key("Enter"));
      field.props.onBlur();
    });
    expect(onRename).toHaveBeenCalledOnce();
  });

  it("does not save an empty or unchanged name", async () => {
    const empty = await startRename();
    await type(empty.renderer, "   ");
    await act(async () => input(empty.renderer).props.onBlur());
    expect(empty.onRename).not.toHaveBeenCalled();

    const unchanged = await startRename();
    await act(async () => input(unchanged.renderer).props.onBlur());
    expect(unchanged.onRename).not.toHaveBeenCalled();
  });

  it("discards the edit on Escape", async () => {
    const { renderer, onRename } = await startRename();
    await type(renderer, "Nope");
    const field = input(renderer);
    await act(async () => {
      field.props.onKeyDown(key("Escape"));
      field.props.onBlur();
    });
    expect(onRename).not.toHaveBeenCalled();
    expect(renderer.root.findByType("h3").props.title).toBe("Old name");
  });

  it("keeps editing when the pointer leaves the card", async () => {
    const { renderer } = await startRename();
    expect(renderer.root.findAllByType("input")).toHaveLength(1);
    const container = input(renderer).parent!;
    expect(container.props.onMouseLeave).toBeUndefined();
  });
});

describe("editor header rename", () => {
  function header(overrides: Record<string, unknown> = {}) {
    const onRenameSubmit = vi.fn();
    const onRenameCancel = vi.fn();
    const props = {
      id: "drawing",
      accessLevel: "owner",
      canEdit: true,
      autoHideEnabled: true,
      autosaveFailing: false,
      drawingName: "Drawing",
      editorContainerRef: { current: null },
      initialData: { elements: [] },
      isHeaderVisible: true,
      isHistoryOpen: false,
      historyPreview: null,
      historyButtonRef: { current: null },
      shareButtonRef: { current: null },
      isRenaming: true,
      isSavingOnLeave: false,
      isSceneLoading: false,
      langCode: "en",
      loadError: null,
      me: { id: "me", name: "Me", color: "red" },
      newName: "Drawing 2",
      peers: [],
      theme: "light",
      gridStep: 20,
      isShareOpen: false,
      onBackClick: vi.fn(),
      onCanvasChange: vi.fn(),
      onCanvasDropCapture: vi.fn(),
      onExportClick: vi.fn(),
      onLibraryChange: vi.fn(),
      onNavigateHome: vi.fn(),
      onNewNameChange: vi.fn(),
      onPointerUpdate: vi.fn(),
      onRenameCancel,
      onRenameStart: vi.fn(),
      onRenameSubmit,
      onSetExcalidrawAPI: vi.fn(),
      onSetLangCode: vi.fn(),
      onSetGridStep: vi.fn(),
      onShareOpen: vi.fn(),
      onCloseShare: vi.fn(),
      onHistoryOpen: vi.fn(),
      onToggleAutoHide: vi.fn(),
      onToggleTheme: vi.fn(),
      ...overrides,
    };
    return {
      onRenameSubmit,
      onRenameCancel,
      element: <EditorView {...(props as never)} />,
    };
  }

  it("saves when the name field loses focus", async () => {
    const { element, onRenameSubmit, onRenameCancel } = header();
    const renderer = await render(element);
    input(renderer).props.onBlur();
    expect(onRenameSubmit).toHaveBeenCalledOnce();
    expect(onRenameCancel).not.toHaveBeenCalled();
  });

  it("does not save when Escape is pressed", async () => {
    const { element, onRenameSubmit, onRenameCancel } = header();
    const renderer = await render(element);
    const field = input(renderer);
    field.props.onKeyDown(key("Escape"));
    field.props.onBlur();
    expect(onRenameCancel).toHaveBeenCalledOnce();
    expect(onRenameSubmit).not.toHaveBeenCalled();
  });

  it("saves once when Enter is followed by blur", async () => {
    const { element, onRenameSubmit } = header();
    const renderer = await render(element);
    const field = input(renderer);
    field.props.onKeyDown(key("Enter"));
    field.props.onBlur();
    expect(onRenameSubmit).toHaveBeenCalledOnce();
  });
});

describe("editor rename command", () => {
  async function commands(newName: string, drawingName = "Drawing") {
    const setDrawingName = vi.fn();
    const setIsRenaming = vi.fn();
    let current!: ReturnType<typeof useEditorCommands>;
    function Harness() {
      const next = useEditorCommands({
        autoHideEnabled: false,
        canEdit: true,
        drawingId: "drawing",
        drawingName,
        isSavingOnLeave: false,
        newName,
        user: null,
        refs: { historyRestorePending: { current: false } } as never,
        debouncedSaveLibrary: vi.fn() as never,
        enqueueSceneSave: vi.fn() as never,
        resolveSafeSnapshot: vi.fn() as never,
        setAutoHideEnabled: vi.fn(),
        setDrawingName,
        setIsHeaderVisible: vi.fn(),
        setIsRenaming,
        setIsSavingOnLeave: vi.fn(),
        setNewName: vi.fn(),
      });
      useLayoutEffect(() => {
        current = next;
      });
      return null;
    }
    await render(<Harness />);
    return {
      run: () => current.handleRenameSubmit(),
      setDrawingName,
      setIsRenaming,
    };
  }

  beforeEach(() => {
    vi.mocked(api.updateDrawing).mockClear();
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  it("saves the trimmed name", async () => {
    const { run, setIsRenaming } = await commands("  Renamed  ");
    await act(async () => run());
    expect(api.updateDrawing).toHaveBeenCalledExactlyOnceWith("drawing", {
      name: "Renamed",
    });
    expect(setIsRenaming).toHaveBeenCalledWith(false);
  });

  it("closes without saving an empty or unchanged name", async () => {
    for (const value of ["   ", "Drawing", " Drawing "]) {
      const { run, setIsRenaming } = await commands(value);
      await act(async () => run());
      expect(setIsRenaming).toHaveBeenCalledWith(false);
    }
    expect(api.updateDrawing).not.toHaveBeenCalled();
  });
});
