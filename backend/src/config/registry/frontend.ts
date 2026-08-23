import type { EnvVarSpec } from "./types";

/**
 * Build-time variables consumed by the Vite frontend (not the backend).
 * Declared docsOnly so they appear only in docs/CONFIGURATION.md and are
 * never emitted into backend/.env.example or parsed by the backend.
 */
export const frontendEnv: readonly EnvVarSpec[] = [
  {
    name: "VITE_API_URL",
    group: "Frontend (build-time)",
    kind: "string",
    default: "/api",
    docsOnly: true,
    doc: "Base URL the frontend uses to reach the backend API. Keep /api so requests stay same-origin (proxied by Vite in dev and nginx in production), avoiding CORS.",
  },
  {
    name: "VITE_EXCALIDASH_UI_FONT_FAMILY",
    group: "Frontend (build-time)",
    kind: "string",
    default: "Excalifont",
    docsOnly: true,
    doc: "Optional app-shell display font family override. Falls back to Excalifont when unset.",
  },
  {
    name: "VITE_EXCALIDASH_UI_FONT_URL",
    group: "Frontend (build-time)",
    kind: "string",
    docsOnly: true,
    doc: "Optional self-hosted WOFF2 URL for the display font; when set, a matching @font-face is injected for VITE_EXCALIDASH_UI_FONT_FAMILY.",
  },
];
