import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createEmbeddedMcpHandler, readBearerToken } from "./embedded.js";

const GOOD_KEY = "exd_goodkey_secret";
const OTHER_KEY = "exd_otherkey_secret";

const listen = async (server: Server): Promise<string> => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
};

const close = (server: Server): Promise<void> =>
  new Promise((resolve) => server.close(() => resolve()));

// Stands in for the ExcaliDash backend: routes have no /api prefix, as when
// the embedded handler calls the backend over loopback.
const startMockApi = async (): Promise<{
  origin: string;
  server: Server;
  seenInternal: string[];
}> => {
  const seenInternal: string[] = [];
  const server = createServer((req, res) => {
    seenInternal.push(String(req.headers["x-internal"] ?? ""));
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${GOOD_KEY}` && auth !== `Bearer ${OTHER_KEY}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    if (req.method === "GET" && req.url?.startsWith("/drawings?")) {
      const limit = Number(
        new URL(req.url, "http://x").searchParams.get("limit"),
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          drawings: [
            {
              id: "d1",
              name: auth === `Bearer ${GOOD_KEY}` ? "Mine" : "Theirs",
              collectionId: null,
              version: 1,
              createdAt: "2026-11-09T00:00:00.000Z",
              updatedAt: "2026-11-09T00:00:00.000Z",
            },
          ],
          totalCount: 1,
          limit,
          offset: 0,
        }),
      );
      return;
    }
    res.writeHead(404).end();
  });
  return { origin: await listen(server), server, seenInternal };
};

const startMcp = async (apiOrigin: string) => {
  const handler = createEmbeddedMcpHandler({
    apiBaseUrl: apiOrigin,
    internalHeaders: { "x-internal": "yes" },
  });
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const body = raw ? JSON.parse(raw) : undefined;
      void handler.handle(req, res, body);
    });
  });
  return { handler, server, url: `${await listen(server)}/mcp` };
};

const initializeBody = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "0" },
  },
};

const post = (url: string, headers: Record<string, string>, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify(body),
  });

test("readBearerToken parses only bearer credentials", () => {
  assert.equal(readBearerToken("Bearer exd_a_b"), "exd_a_b");
  assert.equal(readBearerToken("bearer exd_a_b "), "exd_a_b");
  assert.equal(readBearerToken("Basic abc"), null);
  assert.equal(readBearerToken(undefined), null);
});

test("embedded MCP rejects requests without a valid API key", async () => {
  const api = await startMockApi();
  const mcp = await startMcp(api.origin);
  try {
    const missing = await post(mcp.url, {}, initializeBody);
    assert.equal(missing.status, 401);
    assert.match(missing.headers.get("www-authenticate") ?? "", /Bearer/);

    const wrong = await post(
      mcp.url,
      { Authorization: "Bearer exd_wrong_key" },
      initializeBody,
    );
    assert.equal(wrong.status, 401);
    assert.equal(mcp.handler.sessionCount, 0);
  } finally {
    await mcp.handler.close();
    await close(mcp.server);
    await close(api.server);
  }
});

test("embedded MCP runs tools as the caller and binds sessions to the key", async () => {
  const api = await startMockApi();
  const mcp = await startMcp(api.origin);
  const client = new Client({ name: "embedded-test", version: "0" });
  const transport = new StreamableHTTPClientTransport(new URL(mcp.url), {
    requestInit: { headers: { Authorization: `Bearer ${GOOD_KEY}` } },
  });
  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: "list_drawings",
      arguments: {},
    });
    const text = JSON.stringify(result.content);
    assert.match(text, /Mine/);
    assert.ok(api.seenInternal.length > 0);
    assert.ok(api.seenInternal.every((value) => value === "yes"));
    assert.equal(mcp.handler.sessionCount, 1);

    // Another key cannot ride on this session.
    const hijack = await post(
      mcp.url,
      {
        Authorization: `Bearer ${OTHER_KEY}`,
        "mcp-session-id": transport.sessionId ?? "",
        "mcp-protocol-version": "2025-06-18",
      },
      { jsonrpc: "2.0", id: 9, method: "tools/list", params: {} },
    );
    assert.equal(hijack.status, 404);
  } finally {
    await client.close();
    await mcp.handler.close();
    await close(mcp.server);
    await close(api.server);
  }
});
