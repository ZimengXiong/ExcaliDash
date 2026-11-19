import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { startHttpServer } from "./http.js";
test("readiness rejects HTML redirects failures and stalled bodies; health remains live", async () => {
  let mode = "ok";
  const api = createServer((req, res) => {
    assert.equal(req.headers.authorization, "Bearer fixture-key");
    if (mode === "stall") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.write("{");
      return;
    }
    if (mode === "redirect") {
      res.writeHead(302, { Location: "/login" }).end();
      return;
    }
    if (mode === "html") {
      res
        .writeHead(200, { "Content-Type": "text/html" })
        .end("<html>login</html>");
      return;
    }
    if (mode === "auth") {
      res.writeHead(401).end();
      return;
    }
    res
      .writeHead(200, { "Content-Type": "application/json" })
      .end(
        JSON.stringify(
          mode === "invalid"
            ? {}
            : { drawings: [], totalCount: 0, limit: 1, offset: 0 },
        ),
      );
  });
  await new Promise<void>((r) => api.listen(0, "127.0.0.1", r));
  const a = api.address();
  assert.ok(a && typeof a === "object");
  const mcp = await startHttpServer({
    EXCALIDASH_URL: `http://127.0.0.1:${a.port}`,
    EXCALIDASH_API_KEY: "fixture-key",
    MCP_HTTP_HOST: "127.0.0.1",
    MCP_HTTP_PORT: "0",
  });
  const m = mcp.address();
  assert.ok(m && typeof m === "object");
  const base = `http://127.0.0.1:${m.port}`;
  try {
    for (const value of [
      "ok",
      "html",
      "redirect",
      "auth",
      "invalid",
      "stall",
    ]) {
      mode = value;
      const start = Date.now();
      assert.equal(
        (await fetch(base + "/ready")).status,
        value === "ok" ? 200 : 503,
      );
      assert.ok(Date.now() - start < 5000);
      assert.equal((await fetch(base + "/health")).status, 200);
    }
  } finally {
    mcp.closeAllConnections();
    await new Promise<void>((r) => mcp.close(() => r()));
    api.closeAllConnections();
    await new Promise<void>((r) => api.close(() => r()));
  }
});
test("exact origins deny scheme port path and null; wildcard configuration is rejected", async () => {
  const env = {
    EXCALIDASH_URL: "http://127.0.0.1:1",
    EXCALIDASH_API_KEY: "fixture-key",
    MCP_HTTP_HOST: "127.0.0.1",
    MCP_HTTP_PORT: "0",
    MCP_ALLOWED_ORIGINS: "https://client.example.test",
  };
  const s = await startHttpServer(env);
  const a = s.address();
  assert.ok(a && typeof a === "object");
  const base = `http://127.0.0.1:${a.port}`;
  try {
    for (const [origin, status] of [
      [undefined, 400],
      ["https://client.example.test", 400],
      ["http://client.example.test", 403],
      ["https://client.example.test:8443", 403],
      ["null", 403],
      ["https://client.example.test/path", 403],
    ] as const) {
      const r = await fetch(base + "/mcp", {
        headers: origin ? { Origin: origin } : {},
      });
      assert.equal(r.status, status);
      await r.text();
    }
  } finally {
    s.closeAllConnections();
    await new Promise<void>((r) => s.close(() => r()));
  }
  await assert.rejects(startHttpServer({ ...env, MCP_ALLOWED_HOSTS: "*" }));
  await assert.rejects(startHttpServer({ ...env, MCP_ALLOWED_ORIGINS: "" }));
});
test("old session ID is rejected after process-local listener restart", async () => {
  const env = {
    EXCALIDASH_URL: "http://127.0.0.1:1",
    EXCALIDASH_API_KEY: "fixture-key",
    MCP_HTTP_HOST: "127.0.0.1",
    MCP_HTTP_PORT: "0",
  };
  const first = await startHttpServer(env);
  const address = first.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/mcp`;
  const initialize = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Connection: "close",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "restart-test", version: "1" },
      },
    }),
  });
  assert.equal(initialize.status, 200);
  const session = initialize.headers.get("mcp-session-id");
  assert.ok(session);
  await initialize.text();
  first.closeAllConnections();
  await new Promise<void>((r) => first.close(() => r()));
  const second = await startHttpServer({
    ...env,
    MCP_HTTP_PORT: String(address.port),
  });
  try {
    const old = await fetch(url, {
      headers: { "mcp-session-id": session, Connection: "close" },
    });
    assert.equal(old.status, 404);
    await old.text();
  } finally {
    second.closeAllConnections();
    await new Promise<void>((r) => second.close(() => r()));
  }
});
