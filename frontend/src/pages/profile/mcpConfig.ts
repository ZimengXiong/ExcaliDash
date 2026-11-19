/** Client configuration snippets for the built-in MCP endpoint. */
export const buildMcpClientConfig = (url: string, token: string): string =>
  JSON.stringify(
    {
      mcpServers: {
        excalidash: {
          type: "http",
          url,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  );

export const buildClaudeCodeCommand = (url: string, token: string): string =>
  `claude mcp add --transport http excalidash ${url} --header "Authorization: Bearer ${token}"`;
