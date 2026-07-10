import { useEffect, useState } from "react";
import { getDrawing } from "../../api/drawings";
import type { DrawingEngine } from "../../types";

export type EngineGateState =
  | { status: "loading" }
  | { status: "ready"; engine: DrawingEngine; name: string };

/**
 * Resolve a drawing's rendering engine before the heavy excalidraw editor
 * mounts. This is a lightweight pre-flight: the excalidraw editor still does its
 * own full load (including the shared/link-share redirect flow), so any failure
 * here resolves to "excalidraw" and lets that existing path handle errors and
 * access control. Only a positively-detected "tldraw" row diverts to the
 * placeholder, guaranteeing a tldraw scene never routes into excalidraw.
 */
export const useEngineGate = (id: string | undefined): EngineGateState => {
  const [state, setState] = useState<EngineGateState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setState({ status: "ready", engine: "excalidraw", name: "" });
      return;
    }
    setState({ status: "loading" });
    getDrawing(id)
      .then((drawing) => {
        if (cancelled) return;
        setState({
          status: "ready",
          engine: drawing.engine === "tldraw" ? "tldraw" : "excalidraw",
          name: drawing.name ?? "",
        });
      })
      .catch(() => {
        if (cancelled) return;
        // Fall through to the excalidraw editor, which owns error/access UX.
        setState({ status: "ready", engine: "excalidraw", name: "" });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return state;
};
