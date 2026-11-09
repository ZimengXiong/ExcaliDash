import type { EnvVarSpec } from "./types";

export const mcpEnv: readonly EnvVarSpec[] = [
  {
    name: "MCP_ENABLED",
    group: "MCP server",
    kind: "boolean",
    default: "false",
    doc: "Serve the built-in MCP endpoint at /api/mcp so AI agents can use ExcaliDash with a user API key.",
  },
  {
    name: "MCP_MAX_SESSIONS",
    group: "MCP server",
    kind: "number",
    default: "256",
    doc: "Maximum concurrent MCP sessions across all users.",
  },
  {
    name: "MCP_MAX_SESSIONS_PER_KEY",
    group: "MCP server",
    kind: "number",
    default: "16",
    doc: "Maximum concurrent MCP sessions opened with one API key.",
  },
  {
    name: "MCP_SESSION_IDLE_MS",
    group: "MCP server",
    kind: "number",
    default: "1800000",
    doc: "Idle time (ms) after which an MCP session is closed (30 minutes).",
  },
  {
    name: "MCP_MODULE_PATH",
    group: "MCP server",
    kind: "string",
    doc: "Path to the built mcp/dist/embedded.js; found automatically next to the backend when unset.",
  },
];
