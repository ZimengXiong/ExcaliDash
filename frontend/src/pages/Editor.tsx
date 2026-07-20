import type React from "react";
import { EditorEngineGate } from "./editor/EditorEngineGate";
import { ExcalidrawEditor } from "./editor/ExcalidrawEditor";

export const Editor: React.FC = () => (
  <EditorEngineGate ExcalidrawEditor={ExcalidrawEditor} />
);
