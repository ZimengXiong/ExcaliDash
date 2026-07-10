import type { DrawingEngine } from "../types";

export type EngineMeta = {
  engine: DrawingEngine;
  label: string;
  blurb: string;
  note?: string;
};

// Shared, single source of truth for user-facing engine copy so the creation
// dialog, the settings picker, and the dashboard badge stay in sync.
export const ENGINE_META: Record<DrawingEngine, EngineMeta> = {
  excalidraw: {
    engine: "excalidraw",
    label: "Excalidraw",
    blurb: "Hand-drawn style whiteboard. Collaboration, AI, and import/export.",
  },
  tldraw: {
    engine: "tldraw",
    label: "tldraw",
    blurb: "Infinite canvas with crisp shapes and sticky notes.",
    note: 'Shows a small "Made with tldraw" watermark.',
  },
};

export const ENGINES: DrawingEngine[] = ["excalidraw", "tldraw"];

export const DEFAULT_ENGINE: DrawingEngine = "excalidraw";

export const engineLabel = (engine: DrawingEngine | null | undefined): string =>
  ENGINE_META[engine ?? DEFAULT_ENGINE]?.label ?? ENGINE_META.excalidraw.label;
