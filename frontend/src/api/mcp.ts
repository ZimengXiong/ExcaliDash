import { api, API_URL } from "./client";

export type McpStatus = {
  enabled: boolean;
  available: boolean;
  path: string;
};

export const getMcpStatus = async (): Promise<McpStatus> => {
  const response = await api.get<McpStatus>("/mcp/status");
  return response.data;
};

/** Absolute URL of the built-in MCP endpoint as seen from this browser. */
export const getMcpEndpointUrl = (): string =>
  new URL(`${API_URL.replace(/\/+$/, "")}/mcp`, window.location.origin).href;
