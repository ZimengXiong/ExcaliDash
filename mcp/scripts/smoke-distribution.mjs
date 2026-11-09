import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const [mode, tarball] = process.argv.slice(2);
if (
  (mode !== "--oci" && mode !== "--npm") ||
  (mode === "--oci" && tarball !== undefined) ||
  (mode === "--npm" && (!tarball || !isAbsolute(tarball)))
) {
  throw new Error(
    "Usage: smoke-distribution.mjs --oci | --npm /absolute/path/package.tgz",
  );
}

// Linux host networking lets the container use the fixture on loopback.
// If the image regresses to HTTP, force an ephemeral loopback-only listener.
const apiHost = "127.0.0.1";
const scratch = await mkdtemp(join(tmpdir(), "excalidash-distribution-"));
const containerName = `excalidash-distribution-${randomUUID()}`;
const apiServer = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.headers.authorization !== "Bearer fixture-key") {
    res.writeHead(401).end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }
  if (req.method === "GET" && req.url === "/api/drawings/fixture-1") {
    res.end(
      JSON.stringify({
        id: "fixture-1",
        name: "Distribution smoke",
        version: 1,
        elements: [],
        appState: {},
        files: {},
        collectionId: null,
      }),
    );
    return;
  }
  res.writeHead(404).end(JSON.stringify({ error: "Not found" }));
});
await new Promise((resolve, reject) => {
  apiServer.once("error", reject);
  apiServer.listen(0, apiHost, resolve);
});
const address = apiServer.address();
assert.ok(address && typeof address === "object");
const env = {
  PATH: process.env.PATH ?? "/usr/bin:/bin",
  EXCALIDASH_URL: `http://${apiHost}:${address.port}`,
  EXCALIDASH_API_KEY: "fixture-key",
};
const transport = new StdioClientTransport({
  command: mode === "--oci" ? "docker" : "npm",
  args:
    mode === "--oci"
      ? [
          "run",
          "--rm",
          "-i",
          "--network",
          "host",
          "--name",
          containerName,
          "--env",
          "EXCALIDASH_URL",
          "--env",
          "EXCALIDASH_API_KEY",
          "--env",
          "MCP_HTTP_HOST=127.0.0.1",
          "--env",
          "MCP_HTTP_PORT=0",
          "excalidash-mcp:distribution-check",
        ]
      : [
          "exec",
          "--yes",
          "--package",
          `file:${tarball}`,
          "--",
          "excalidashapi-mcp",
        ],
  env:
    mode === "--npm"
      ? { ...env, npm_config_cache: join(scratch, "cache") }
      : env,
  cwd: scratch,
});
const client = new Client({ name: "distribution-check", version: "1" });
let timeout;
try {
  await Promise.race([
    client.connect(transport),
    new Promise((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error("stdio handshake timeout")),
        mode === "--oci" ? 5000 : 90000,
      );
    }),
  ]);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 17);
  const selected = await client.callTool({
    name: "select_drawing",
    arguments: { drawingId: "fixture-1" },
  });
  assert.notEqual(
    selected.isError,
    true,
    selected.content[0]?.type === "text"
      ? selected.content[0].text
      : "MCP selection failed",
  );
  const current = await client.callTool({
    name: "get_selected_drawing",
    arguments: {},
  });
  assert.notEqual(current.isError, true);
  assert.equal(
    JSON.parse(current.content[0].text).selectedDrawingId,
    "fixture-1",
  );
  console.log(
    `${mode} installed artifact: MCP handshake, 17 tools and drawing selection passed`,
  );
} finally {
  clearTimeout(timeout);
  await client.close().catch(() => undefined);
  if (mode === "--oci") {
    spawnSync("docker", ["rm", "-f", containerName], { stdio: "ignore" });
  }
  apiServer.closeAllConnections();
  await new Promise((resolve) => apiServer.close(resolve));
  await rm(scratch, { recursive: true, force: true });
}
