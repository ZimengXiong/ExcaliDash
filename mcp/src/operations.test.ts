import assert from "node:assert/strict";
import test from "node:test";
import { AliasScope } from "./operations.js";
const creates = [
  { op: "add_shape", shape: "rectangle", x: 0, y: 0, ref: "client" },
  { op: "add_shape", shape: "rectangle", x: 200, y: 0, ref: "server" },
];
const connects = [{ op: "connect", fromId: "client", toId: "server" }];
const result = {
  version: 2,
  results: [
    { opIndex: 0, createdIds: ["real-client", "label"] },
    { opIndex: 1, createdIds: ["real-server"] },
  ],
};
test("aliases resolve only after success within a drawing and session", () => {
  const a = new AliasScope();
  a.prepare("A", creates);
  assert.equal(a.prepare("A", connects)[0]?.fromId, "client");
  assert.deepEqual(a.commit("A", creates, result), {
    client: "real-client",
    server: "real-server",
  });
  assert.equal(a.prepare("A", connects)[0]?.fromId, "real-client");
  assert.equal(a.prepare("B", connects)[0]?.fromId, "client");
  assert.equal(new AliasScope().prepare("A", connects)[0]?.fromId, "client");
  a.commit("A", [{ op: "delete", id: "client" }], {
    version: 3,
    results: [{ opIndex: 0 }],
  });
  assert.equal(a.prepare("A", connects)[0]?.fromId, "client");
  assert.equal(a.prepare("A", connects)[0]?.toId, "real-server");
  a.commit("A", [{ op: "revert_to_snapshot", version: 1 }], {
    version: 4,
    results: [{ opIndex: 0 }],
  });
  assert.equal(a.prepare("A", connects)[0]?.toId, "server");
});
test("same-batch aliases and duplicate refs are rejected without changing state", () => {
  const a = new AliasScope();
  assert.throws(() => a.prepare("A", [...creates, ...connects]));
  assert.throws(() => a.prepare("A", [creates[0]!, creates[0]!]));
  a.commit("A", creates, result);
  assert.throws(() => a.prepare("A", [...creates, ...connects]));
  assert.equal(a.prepare("A", connects)[0]?.fromId, "real-client");
});
test("missing returned IDs never partially commits aliases", () => {
  const a = new AliasScope();
  assert.throws(() =>
    a.commit("A", creates, {
      version: 2,
      results: [{ opIndex: 0, createdIds: ["one"] }],
    }),
  );
  assert.equal(a.prepare("A", connects)[0]?.fromId, "client");
});
test("alias capacity is bounded across drawings and replacement does not consume slots", () => {
  const a = new AliasScope();
  for (let i = 0; i < 1000; i++)
    a.commit("A", [{ op: "add_shape", ref: "r" + i }], {
      version: i + 1,
      results: [{ opIndex: 0, createdIds: ["id" + i] }],
    });
  assert.throws(() => a.prepare("B", [{ op: "add_shape", ref: "overflow" }]));
  assert.doesNotThrow(() => a.prepare("A", [{ op: "add_shape", ref: "r0" }]));
  a.commit("A", [{ op: "add_shape", ref: "r0" }], {
    version: 1001,
    results: [{ opIndex: 0, createdIds: ["replacement"] }],
  });
  assert.equal(
    a.prepare("A", [{ op: "move", id: "r0", dx: 1 }])[0]?.id,
    "replacement",
  );
  a.forget("A");
  assert.doesNotThrow(() =>
    a.prepare("B", [{ op: "add_shape", ref: "available" }]),
  );
});
