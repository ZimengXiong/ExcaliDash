import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { ExcaliDashClient, ExcaliDashError } from "./excalidash.js";
import type { Element } from "./scene.js";
test("addImage preserves files and refuses stale scene without retry", async () => {
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
  const oldFile = {
    id: "oldFile",
    mimeType: "image/png",
    dataURL: "/api/files/d/oldFile",
  };
  let state = {
    id: "d",
    name: "fixture",
    version: 3,
    collectionId: "c",
    appState: { viewBackgroundColor: "#fff" },
    elements: [{ id: "old", type: "rectangle" }] as Element[],
    files: { oldFile } as Record<string, typeof oldFile>,
  };
  let conflict = false;
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET") {
      res.end(JSON.stringify(state));
      return;
    }
    if (req.method !== "PUT") {
      res.writeHead(405).end();
      return;
    }
    let raw = "";
    for await (const part of req) raw += part.toString();
    const patch = JSON.parse(raw);
    if (conflict) {
      conflict = false;
      state = {
        ...state,
        version: state.version + 1,
        elements: [
          ...state.elements,
          { id: "concurrent", type: "text", text: "Other editor" },
        ],
      };
    }
    if (patch.version !== state.version) {
      res
        .writeHead(409)
        .end(JSON.stringify({ error: "Conflict", code: "VERSION_CONFLICT" }));
      return;
    }
    state = {
      ...state,
      ...patch,
      version: state.version + 1,
      files: { ...state.files, ...patch.files },
    };
    res.end(JSON.stringify(state));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const a = server.address();
  assert.ok(a && typeof a === "object");
  const client = new ExcaliDashClient({
    url: `http://127.0.0.1:${a.port}`,
    token: "test-only",
  });
  const input = {
    mimeType: "image/png" as const,
    base64: png,
    x: 0,
    y: 0,
    width: 20,
    height: 20,
  };
  try {
    const added = await client.addImage("d", input);
    const saved = await client.getDrawing("d");
    assert.equal(saved.collectionId, "c");
    assert.deepEqual(saved.appState, { viewBackgroundColor: "#fff" });
    assert.deepEqual(saved.files.oldFile, oldFile);
    assert.ok(saved.elements.some((e) => e.id === added.elementId));
    const before = structuredClone(saved);
    conflict = true;
    await assert.rejects(
      client.addImage("d", input),
      (e: unknown) => e instanceof ExcaliDashError && e.status === 409,
    );
    const after = await client.getDrawing("d");
    assert.equal(after.version, before.version + 1);
    assert.deepEqual(after.files, before.files);
    assert.equal(after.collectionId, "c");
    assert.deepEqual(after.elements, [
      ...before.elements,
      { id: "concurrent", type: "text", text: "Other editor" },
    ]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
