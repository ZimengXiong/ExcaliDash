import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../src/styles";
import { exportToSvg } from "@excalidraw/excalidraw";
import { EditorView } from "../../src/pages/editor/EditorView";
import { readViewport } from "../../src/pages/editor/viewport";

// A drawing using the stable 0.18.1 scene format, independent of the new SDK.
const legacyElements = [
  {
    id: "legacy-box",
    type: "rectangle",
    x: 100,
    y: 150,
    width: 240,
    height: 120,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: "a0",
    roundness: { type: 3 },
    seed: 1,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
  },
];
const saved = JSON.parse(
  sessionStorage.getItem("editor-browser-scene") ?? "null",
);
const viewport = readViewport("browser-user", "browser-drawing");
const initialData = {
  elements: saved?.elements ?? legacyElements,
  appState: { viewBackgroundColor: "#ffffff", ...viewport },
  scrollToContent: !viewport,
};
const noop = () => {};
const check = { api: null as any, exportSvg: async () => "" };
(window as any).editorCheck = check;
(window as any).EXCALIDRAW_ASSET_PATH = "/";

export function Harness() {
  const [langCode, setLangCode] = useState("pt-BR");
  const [theme, setTheme] = useState("dark");
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const historyButtonRef = useRef<HTMLButtonElement>(null);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  return (
    <EditorView
      id="browser-drawing"
      accessLevel="edit"
      canEdit
      autoHideEnabled={false}
      autosaveFailing={false}
      drawingName="Browser check"
      editorContainerRef={editorContainerRef}
      initialData={initialData}
      isHeaderVisible={false}
      isHistoryOpen={false}
      historyPreview={null}
      historyButtonRef={historyButtonRef}
      shareButtonRef={shareButtonRef}
      isRenaming={false}
      isSavingOnLeave={false}
      isSceneLoading={false}
      langCode={langCode}
      loadError={null}
      me={{ id: "browser-user", name: "Browser", initials: "B", color: "red" }}
      newName="Browser check"
      peers={[]}
      theme={theme}
      onBackClick={noop}
      onCanvasChange={(elements) =>
        sessionStorage.setItem(
          "editor-browser-scene",
          JSON.stringify({ elements }),
        )
      }
      onCanvasDropCapture={noop}
      onExportClick={noop}
      onLibraryChange={noop}
      onNavigateHome={noop}
      onNewNameChange={noop}
      onPointerUpdate={noop}
      onRenameBlur={noop}
      onRenameStart={noop}
      onRenameSubmit={noop}
      onSetExcalidrawAPI={(api) => {
        check.api = api;
        check.exportSvg = async () =>
          (
            await exportToSvg({
              elements: api.getSceneElements(),
              appState: api.getAppState(),
              files: api.getFiles(),
            })
          ).outerHTML;
      }}
      onSetLangCode={setLangCode}
      gridStep={20}
      onSetGridStep={noop}
      onShareOpen={noop}
      isShareOpen={false}
      onCloseShare={noop}
      onHistoryOpen={noop}
      onToggleAutoHide={noop}
      onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
    />
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
