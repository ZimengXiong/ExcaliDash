import { describe, expect, it } from "vitest";
import {
  buildClaudeCodeCommand,
  buildMcpClientConfig,
} from "../src/pages/profile/mcpConfig";

describe("MCP client configuration snippets", () => {
  const url = "https://draw.example.com/api/mcp";
  const token = "exd_abc_def";

  it("builds an mcpServers JSON entry with the bearer header", () => {
    expect(JSON.parse(buildMcpClientConfig(url, token))).toEqual({
      mcpServers: {
        excalidash: {
          type: "http",
          url,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    });
  });

  it("builds a Claude Code command", () => {
    expect(buildClaudeCodeCommand(url, token)).toBe(
      'claude mcp add --transport http excalidash https://draw.example.com/api/mcp --header "Authorization: Bearer exd_abc_def"',
    );
  });
});
