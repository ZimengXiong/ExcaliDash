import assert from "node:assert/strict";
import test from "node:test";
import {
  findElements,
  decodeImage,
  appendImage,
  type SceneData,
  type ImageInput,
} from "./scene.js";
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const input: ImageInput = {
  mimeType: "image/png",
  base64: PNG,
  x: 10,
  y: 20,
  width: 50,
  height: 60,
};
test("find combines literal filters, excludes tombstones before pagination", () => {
  const scene: SceneData = {
    id: "d",
    version: 7,
    appState: {},
    files: {},
    elements: [
      { id: "a", type: "text", text: "A.*" },
      { id: "deleted", type: "text", text: "A.*", isDeleted: true },
      { id: "b", type: "text", text: "AB" },
      { id: "c", type: "rectangle", text: "A.*" },
      { id: "e", type: "text", text: "A.* suffix" },
    ],
  };
  const result = findElements(scene, {
    type: "text",
    text: ".*",
    limit: 1,
    offset: 1,
  });
  assert.equal(result.totalCount, 2);
  assert.deepEqual(
    result.elements.map((e) => e.id),
    ["e"],
  );
  assert.equal(result.version, 7);
  assert.deepEqual(
    findElements(scene, { id: "a", text: "absent", limit: 50, offset: 0 })
      .elements,
    [],
  );
});
test("image patch preserves elements, omits metadata, and reuses files", () => {
  const scene: SceneData = {
    id: "d",
    version: 3,
    elements: [
      {
        id: "old",
        type: "rectangle",
        boundElements: [{ id: "label", type: "text" }],
      },
    ],
    appState: { background: "white" },
    files: {},
  };
  const before = structuredClone(scene),
    image = decodeImage(input),
    built = appendImage(scene, input, image);
  assert.deepEqual(scene, before);
  assert.deepEqual(built.patch.elements[0], scene.elements[0]);
  assert.equal(built.patch.version, 3);
  assert.equal(built.patch.elements[1]?.fileId, built.fileId);
  assert.equal(
    built.patch.files[built.fileId]?.dataURL,
    `data:image/png;base64,${PNG}`,
  );
  assert.equal("appState" in built.patch, false);
  assert.equal("collectionId" in built.patch, false);
  const reused = appendImage(
    { ...scene, files: built.patch.files },
    input,
    image,
  );
  assert.deepEqual(reused.patch.files, {});
  assert.notEqual(reused.elementId, built.elementId);
});
test("invalid MIME base64 and oversized images fail before write", () => {
  assert.throws(() => decodeImage({ ...input, base64: "not base64" }));
  assert.throws(() => decodeImage({ ...input, mimeType: "image/jpeg" }));
  assert.throws(() =>
    decodeImage({ ...input, base64: "data:image/png;base64," + PNG }),
  );
  assert.throws(() =>
    decodeImage({
      ...input,
      base64: Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64"),
    }),
  );
});
