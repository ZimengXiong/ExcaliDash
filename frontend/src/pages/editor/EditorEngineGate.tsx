import React, { Suspense } from "react";
import { useParams } from "react-router-dom";
import { useEngineGate } from "./useEngineGate";
import { EditorLoading } from "./TldrawUnavailable";

const TldrawEditorPage = React.lazy(() => import("../tldraw/TldrawEditorPage"));

export const EditorEngineGate = ({
  ExcalidrawEditor,
}: {
  ExcalidrawEditor: React.ComponentType;
}) => {
  const { id } = useParams<{ id: string }>();
  const gate = useEngineGate(id);
  if (gate.status === "loading") return <EditorLoading />;
  if (gate.engine === "tldraw")
    return (
      <Suspense fallback={<EditorLoading />}>
        <TldrawEditorPage />
      </Suspense>
    );
  return <ExcalidrawEditor />;
};
