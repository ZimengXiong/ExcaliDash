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
  {
    name: "VITE_TLDRAW_LICENSE_KEY",
    group: "Frontend (build-time)",
    kind: "string",
    docsOnly: true,
    doc: "Optional tldraw SDK license key passed to the tldraw editor. Unset by default: the free tldraw 3.x license keeps the on-canvas \"Made with tldraw\" watermark (which must not be hidden). Deployers who purchase a key can set it here to remove the watermark. Only affects tldraw-engine drawings; excalidraw is unaffected.",
  },
];
