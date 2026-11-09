import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { requestPathname, startHttpServer } from "./http.js";
import net from "node:net";

const listenMockApi = async (): Promise<{
  origin: string;
  close: () => Promise<void>;
}> => {
  const server = createServer((req, res) => {
    assert.equal(req.headers.authorization, "Bearer container-test-key");
    if (req.method === "GET" && req.url === "/api/drawings?limit=50&offset=0") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          drawings: [
            {
              id: "drawing-http-1",
              name: "HTTP drawing",
              engine: "excalidraw",
              collectionId: null,
              version: 3,
              createdAt: "2026-08-11T00:00:00.000Z",
              updatedAt: "2026-08-11T00:00:00.000Z",
            },
          ],
          totalCount: 1,
          limit: 50,
          offset: 0,
        }),
      );
      return;
    }
    if (req.method === "GET" && req.url === "/api/drawings/drawing-http-1") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: "drawing-http-1",
          name: "HTTP drawing",
          engine: "excalidraw",
          elements: [],
          appState: {},
          files: {},
          collectionId: null,
          version: 3,
          createdAt: "2026-08-11T00:00:00.000Z",
          updatedAt: "2026-08-11T00:00:00.000Z",
        }),
      );
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
};

test("Streamable HTTP keeps drawing selection isolated in its MCP session", async () => {
  const api = await listenMockApi();
  const server = await startHttpServer({
    EXCALIDASH_URL: api.origin,
    EXCALIDASH_API_KEY: "container-test-key",
    MCP_HTTP_HOST: "127.0.0.1",
    MCP_HTTP_PORT: "0",
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const health = await fetch(`http://127.0.0.1:${address.port}/health`);
  assert.equal(health.status, 200);

  const client = new Client({ name: "http-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${address.port}/mcp`),
  );

  try {
    await client.connect(transport);
    const listed = await client.callTool({
      name: "list_drawings",
      arguments: {},
    });
    assert.equal(listed.isError, undefined);

    const selected = await client.callTool({
      name: "select_drawing",
      arguments: { drawingId: "drawing-http-1" },
    });
    assert.equal(selected.isError, undefined);

    const current = await client.callTool({
      name: "get_selected_drawing",
      arguments: {},
    });
    assert.match(
      current.content[0]?.type === "text" ? current.content[0].text : "",
      /drawing-http-1/,
    );
    const other = new Client({ name: "independent-session", version: "1" });
    try {
      await other.connect(
        new StreamableHTTPClientTransport(
          new URL(`http://127.0.0.1:${address.port}/mcp`),
        ),
      );
      const unselected = await other.callTool({
        name: "get_selected_drawing",
        arguments: {},
      });
      assert.equal(
        unselected.content[0]?.type === "text"
          ? unselected.content[0].text
          : undefined,
        "No drawing selected.",
      );
    } finally {
      await other.close();
    }
  } finally {
    await client.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await api.close();
  }
});

test("requestPathname never parses the untrusted Host header", () => {
  assert.equal(requestPathname("/mcp?x=1"), "/mcp");
  assert.equal(requestPathname("/health"), "/health");
  assert.equal(requestPathname(undefined), "/");
  assert.equal(requestPathname("mcp"), "/mcp");
});

test("a malformed Host header cannot take the server down", async () => {
  const server = await startHttpServer({
    EXCALIDASH_URL: "http://127.0.0.1:1",
    EXCALIDASH_API_KEY: "crash-probe-key",
    MCP_HTTP_HOST: "127.0.0.1",
    MCP_HTTP_PORT: "0",
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const rawRequest = (host: string): Promise<string> =>
    new Promise((resolve) => {
      const socket = net.connect(address.port, "127.0.0.1", () => {
        socket.write(
          `GET /health HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`,
        );
      });
      let data = "";
      socket.on("data", (chunk) => {
        data += chunk;
      });
      socket.on("close", () => resolve(data.split("\r\n")[0] ?? ""));
      socket.on("error", () => resolve("socket-error"));
      setTimeout(() => {
        socket.destroy();
        resolve("timeout");
      }, 2000);
    });

  try {
    for (const host of ["][", "[::1", "a b", "@@@"]) {
      await rawRequest(host);
    }
    assert.equal(server.listening, true);
    const health = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(health.status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("abandoned MCP sessions are capped instead of accumulating", async () => {
  const server = await startHttpServer({
    EXCALIDASH_URL: "http://127.0.0.1:1",
    EXCALIDASH_API_KEY: "session-probe-key",
    MCP_HTTP_HOST: "127.0.0.1",
    MCP_HTTP_PORT: "0",
    MCP_MAX_SESSIONS: "3",
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const initialize = (): Promise<Response> =>
    fetch(`http://127.0.0.1:${address.port}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "probe", version: "1.0.0" },
        },
      }),
    });

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await initialize();
      await response.text();
      assert.equal(response.status, 200);
    }

    const rejected = await initialize();
    const body = await rejected.text();
    assert.equal(rejected.status, 429);
    assert.match(body, /Too many active MCP sessions/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
