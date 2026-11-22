import { crc32, deflateSync } from "node:zlib";
import { useLayoutEffect } from "react";
import { act, create } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import {
  createDroppedFileMerger,
  MAX_DROP_BYTES,
  MAX_DROP_FILE_BYTES,
  mayContainExcalidrawScene,
  prepareSceneElementsForAppend,
  readDroppedScene,
  validateDroppedScene,
  withSceneMimeType,
} from "../src/pages/editor/droppedScenes";
import { useEditorCanvasHandlers } from "../src/pages/editor/useEditorCanvasHandlers";

vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { IMMEDIATELY: "IMMEDIATELY" },
  restoreElements: (elements: unknown) => elements,
  getCommonBounds: () => [0, 0, 10, 10],
  viewportCoordsToSceneCoords: () => ({ x: 0, y: 0 }),
  convertToExcalidrawElements: (elements: unknown) => elements,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("../src/pages/editor/droppedImages", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../src/pages/editor/droppedImages")
  >()),
  loadDroppedImageData: vi.fn(async () => ({
    fileId: "photo",
    mimeType: "image/jpeg",
    dataURL: "data:image/jpeg;base64,AAAA",
    width: 10,
    height: 10,
    created: 1,
  })),
}));

const destination = new URL(
  "https://dash.example/editor/destination?element=old",
);

const sequentialIds = () => {
  let next = 0;
  return () => `new-${++next}`;
};

const scene = [
  {
    id: "box",
    type: "rectangle",
    x: 10,
    y: 20,
    index: "a0",
    groupIds: ["g1"],
    frameId: "frame",
    boundElements: [
      { id: "label", type: "text" },
      { id: "arrow", type: "arrow" },
      { id: "gone", type: "arrow" },
    ],
  },
  {
    id: "label",
    type: "text",
    x: 15,
    y: 25,
    index: "a1",
    groupIds: ["g1"],
    frameId: "frame",
    containerId: "box",
  },
  {
    id: "arrow",
    type: "arrow",
    x: 100,
    y: 100,
    index: "a2",
    groupIds: [],
    frameId: null,
    startBinding: { elementId: "box", focus: 0, gap: 1 },
    endBinding: { elementId: "gone", focus: 0, gap: 1 },
    points: [
      [0, 0],
      [50, 50],
    ],
  },
  { id: "frame", type: "frame", x: 0, y: 0, index: "a3", groupIds: [] },
  { id: "gone", type: "arrow", x: 0, y: 0, isDeleted: true, groupIds: [] },
];

describe("prepareSceneElementsForAppend", () => {
  const prepared = prepareSceneElementsForAppend(scene, {
    bounds: [0, 0, 150, 150],
    origin: { x: 1000, y: 2000 },
    createId: sequentialIds(),
    destination,
  });
  const byOldId = Object.fromEntries(
    scene
      .filter((element) => !element.isDeleted)
      .map((element, i) => [element.id, prepared[i]]),
  );

  it("drops deleted elements and gives the rest fresh ids", () => {
    expect(prepared.map((element) => element.id)).toEqual([
      "new-1",
      "new-3",
      "new-4",
      "new-5",
    ]);
  });

  it("moves the scene's top-left corner to the origin", () => {
    expect(byOldId.box).toMatchObject({ x: 1010, y: 2020 });
    expect(byOldId.arrow).toMatchObject({ x: 1100, y: 2100 });
    expect(byOldId.arrow.points).toEqual(scene[2].points);
  });

  it("rewrites references between elements to the new ids", () => {
    expect(byOldId.label.containerId).toBe(byOldId.box.id);
    expect(byOldId.box.frameId).toBe(byOldId.frame.id);
    expect(byOldId.box.boundElements).toEqual([
      { id: byOldId.label.id, type: "text" },
      { id: byOldId.arrow.id, type: "arrow" },
    ]);
    expect(byOldId.arrow.startBinding).toEqual({
      elementId: byOldId.box.id,
      focus: 0,
      gap: 1,
    });
    expect(byOldId.arrow.endBinding).toBeNull();
  });

  it("gives groups fresh ids shared by their members", () => {
    expect(byOldId.box.groupIds).toEqual(["new-2"]);
    expect(byOldId.label.groupIds).toEqual(["new-2"]);
  });

  it("clears fractional indices so they sort after the open drawing", () => {
    expect(prepared.every((element) => element.index === null)).toBe(true);
  });

  it("leaves the input untouched", () => {
    expect(scene[0].id).toBe("box");
    expect(scene[0].x).toBe(10);
  });
});

describe("element links", () => {
  const base = "https://source.example/editor/abc";
  const linked = [
    { id: "target", type: "rectangle", x: 0, y: 0, groupIds: ["grp"] },
    {
      id: "toElement",
      type: "rectangle",
      x: 0,
      y: 0,
      groupIds: [],
      link: `${base}?element=target`,
    },
    {
      id: "toGroup",
      type: "rectangle",
      x: 0,
      y: 0,
      groupIds: [],
      link: `${base}?element=grp`,
    },
    {
      id: "external",
      type: "rectangle",
      x: 0,
      y: 0,
      groupIds: [],
      link: "https://example.com/?element=target",
    },
    {
      id: "plain",
      type: "rectangle",
      x: 0,
      y: 0,
      groupIds: [],
      link: "not a url",
    },
    {
      id: "other-drawing",
      link: "https://source.example/editor/other?element=target",
      x: 0,
      y: 0,
    },
    { id: "missing-target", link: `${base}?element=elsewhere`, x: 0, y: 0 },
    { id: "query-only", link: "?element=target", x: 0, y: 0 },
  ];
  const prepared = prepareSceneElementsForAppend(linked, {
    bounds: [0, 0, 10, 10],
    origin: { x: 0, y: 0 },
    createId: sequentialIds(),
    destination,
    source: base,
  });
  const newTargetId = prepared[0].id;
  const newGroupId = prepared[0].groupIds[0];

  it("points links at the new element and group ids", () => {
    expect(new URL(prepared[1].link).searchParams.get("element")).toBe(
      newTargetId,
    );
    expect(new URL(prepared[2].link).searchParams.get("element")).toBe(
      newGroupId,
    );
    expect(prepared[1].link).toBe(
      `${destination.origin}${destination.pathname}?element=${newTargetId}`,
    );
    expect(prepared[7].link).toBe(prepared[1].link);
  });

  it("leaves links to anything outside the scene alone", () => {
    expect(prepared[3].link).toBe("https://example.com/?element=target");
    expect(prepared[4].link).toBe("not a url");
    expect(prepared[5].link).toBe(linked[5].link);
    expect(prepared[6].link).toBe(linked[6].link);
  });

  it("recognizes drawing routes when an export only records its origin", () => {
    const original = new URL(base);
    const result = prepareSceneElementsForAppend(linked, {
      bounds: [0, 0, 10, 10],
      origin: { x: 0, y: 0 },
      createId: sequentialIds(),
      destination,
      source: original.origin,
    });
    expect(result[1].link).toBe(prepared[1].link);
    expect(result[3].link).toBe(linked[3].link);
  });
});

describe("dropped file detection", () => {
  it("treats Excalidraw files and any PNG or SVG as a possible scene", () => {
    const candidates = [
      new File([""], "a.excalidraw"),
      new File([""], "a.excalidraw.png", { type: "image/png" }),
      new File([""], "a.excalidraw.svg", { type: "image/svg+xml" }),
      new File([""], "renamed.png"),
      new File([""], "no-extension", { type: "image/svg+xml" }),
      new File([""], "saved-scene.json"),
      new File([""], "no-extension", { type: "application/json" }),
    ];
    expect(candidates.every(mayContainExcalidrawScene)).toBe(true);
    expect(
      mayContainExcalidrawScene(
        new File([""], "photo.jpg", { type: "image/jpeg" }),
      ),
    ).toBe(false);
    expect(mayContainExcalidrawScene(new File([""], "a.excalidrawlib"))).toBe(
      false,
    );
  });

  it("fills in a missing MIME type from the extension", () => {
    expect(withSceneMimeType(new File([""], "a.excalidraw.png")).type).toBe(
      "image/png",
    );
    expect(withSceneMimeType(new File([""], "a.excalidraw.svg")).type).toBe(
      "image/svg+xml",
    );
    expect(withSceneMimeType(new File([""], "a.excalidraw")).type).toBe(
      "application/vnd.excalidraw+json",
    );
    expect(withSceneMimeType(new File([""], "a.json")).type).toBe(
      "application/json",
    );
  });

  it("overrides a generic MIME type that contradicts the extension", () => {
    const mislabelled = new File([""], "a.excalidraw.png", {
      type: "application/octet-stream",
    });
    expect(withSceneMimeType(mislabelled).type).toBe("image/png");
    const correct = new File([""], "a.png", { type: "image/png" });
    expect(withSceneMimeType(correct)).toBe(correct);
  });
});

const rectangle = {
  id: "box",
  type: "rectangle",
  x: 0,
  y: 0,
  width: 10,
  height: 10,
};
const drawing = { type: "excalidraw", elements: [rectangle] };
const drawFile = (name: string, data: unknown) =>
  new File([JSON.stringify(data)], name);
const asset = (id: string, bytes: string) => ({
  id,
  dataURL: `data:image/png;base64,${bytes}`,
  mimeType: "image/png",
  created: 1,
});
const image = (fileId: string) => ({
  ...rectangle,
  id: `image-${fileId}`,
  type: "image",
  fileId,
});

const sceneMime = "application/vnd.excalidraw+json";
const encoded = (text: string) =>
  JSON.stringify({
    version: "1",
    encoding: "bstring",
    compressed: true,
    encoded: deflateSync(text).toString("latin1"),
  });
const svg = (payload: string, version = "2") =>
  new File(
    [
      `<svg><!-- payload-type:${sceneMime} --><!-- payload-version:${version} --><!-- payload-start -->${payload}<!-- payload-end --></svg>`,
    ],
    "scene.svg",
    { type: "image/svg+xml" },
  );
const png = (payload?: string) => {
  const base = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
    "base64",
  );
  if (payload === undefined)
    return new File([base], "scene.png", { type: "image/png" });
  const chunkData = Buffer.from(`${sceneMime}\0${payload}`, "latin1");
  const chunk = Buffer.alloc(12 + chunkData.length);
  chunk.writeUInt32BE(chunkData.length);
  chunk.write("tEXt", 4);
  chunkData.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  return new File(
    [base.subarray(0, -12), chunk, base.subarray(-12)],
    "scene.png",
    { type: "image/png" },
  );
};

describe("scene decoding", () => {
  const sceneText = JSON.stringify({
    ...drawing,
    elements: [{ ...rectangle, id: "β" }],
  });
  const wrapper = encoded(sceneText);

  it("reads compressed PNG and SVG exports and legacy UTF-8 SVG metadata", async () => {
    const files = [
      png(wrapper),
      svg(btoa(wrapper)),
      svg(Buffer.from(sceneText).toString("base64"), "1"),
    ];
    const budget = { remaining: 1024 };
    for (const file of files)
      expect(await readDroppedScene(file, budget)).toMatchObject({
        text: sceneText,
      });
    expect(budget.remaining).toBe(1024 - 3 * Buffer.byteLength(sceneText));
    await expect(readDroppedScene(png(), budget)).resolves.toBeNull();
  });

  it("rejects a file before reading when the input exceeds the per-file or remaining scene budget", async () => {
    const file = drawFile("drawing.excalidraw", drawing);
    const read = vi.spyOn(file, "text");
    await expect(
      readDroppedScene(file, { remaining: file.size - 1 }),
    ).rejects.toThrow("size limit");
    Object.defineProperty(file, "size", { value: MAX_DROP_FILE_BYTES + 1 });
    await expect(
      readDroppedScene(file, { remaining: MAX_DROP_BYTES }),
    ).rejects.toThrow("size limit");
    expect(read).not.toHaveBeenCalled();
  });

  it("stops inflating a scene when it exceeds the remaining decoded budget", async () => {
    const file = png(
      encoded(JSON.stringify({ ...drawing, padding: "a".repeat(4096) })),
    );
    const budget = { remaining: 512 };
    expect(file.size).toBeLessThan(budget.remaining);
    await expect(readDroppedScene(file, budget)).rejects.toThrow("size limit");
    expect(budget.remaining).toBe(0);
  });

  it("rejects malformed scene elements and skips invalid asset records", () => {
    expect(() =>
      validateDroppedScene({ ...drawing, elements: [null] }),
    ).toThrow("Invalid drawing");
    const result = validateDroppedScene({
      ...drawing,
      elements: [rectangle, image("good"), image("missing"), image("invalid")],
      files: {
        good: asset("good", "AA=="),
        missing: null,
        invalid: asset("invalid", "!"),
        mismatch: asset("other", "AQ=="),
      },
    });
    expect(result).toMatchObject({
      elements: [rectangle, image("good")],
      files: [asset("good", "AA==")],
    });
    expect(validateDroppedScene({ ...drawing, files: [null] })).toMatchObject({
      files: [],
    });
  });
});

it("reuses matching content and remaps conflicts with existing and dropped images", () => {
  const existing = asset("shared", "AA==");
  const merger = createDroppedFileMerger(
    { shared: existing },
    ["new-1", "missing"],
    sequentialIds(),
  );
  expect(merger.merge([{ ...existing, created: 2 }]).size).toBe(0);
  const other = asset("shared", "AQ==");
  const first = merger.merge([other, asset("sibling", "AA==")]);
  expect(first.get("shared")).toBe("new-2");
  expect(merger.merge([other]).get("shared")).toBe("new-2");
  const collision = merger.merge([
    asset("sibling", "Ag=="),
    asset("missing", "Aw=="),
  ]);
  expect(collision.get("sibling")).toBe("new-3");
  expect(collision.get("missing")).toBe("new-4");
  const [element] = prepareSceneElementsForAppend([image("shared")], {
    bounds: [0, 0, 10, 10],
    origin: { x: 0, y: 0 },
    destination,
    createId: sequentialIds(),
    fileIds: first,
  });
  expect(element.fileId).toBe("new-2");
  expect(merger.files).toEqual([
    { ...other, id: "new-2" },
    asset("sibling", "AA=="),
    asset("new-3", "Ag=="),
    asset("new-4", "Aw=="),
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("captures a mixed drop, keeps the canvas, and skips unsupported, malformed and oversized siblings", async () => {
  vi.stubGlobal("window", { location: destination });
  vi.spyOn(console, "error").mockImplementation(() => {});
  const existing = image("shared");
  const api = {
    getSceneElementsIncludingDeleted: () => [existing],
    getAppState: () => ({ height: 300, zoom: { value: 1 } }),
    getFiles: () => ({ shared: asset("shared", "AA==") }),
    addFiles: vi.fn(),
    updateScene: vi.fn(),
  };
  let onDrop!: ReturnType<
    typeof useEditorCanvasHandlers
  >["handleCanvasDropCapture"];
  const Harness = () => {
    const ref = <T,>(current: T) => ({ current });
    const { handleCanvasDropCapture } = useEditorCanvasHandlers({
      appendDroppedDrawings: true,
      canEdit: true,
      isReady: false,
      markSceneChanged: vi.fn(),
      drawingId: "destination",
      debouncedSavePreview: vi.fn(),
      emitFilesDeltaIfNeeded: vi.fn(),
      resolveSafeSnapshot: vi.fn(),
      broadcastChanges: vi.fn(),
      refs: {
        excalidrawAPI: ref(api),
        isUnmounting: ref(false),
        hasHydratedInitialScene: ref(true),
        initialSceneElements: ref([]),
        isBootstrappingScene: ref(false),
        isSyncing: ref(false),
        latestAppState: ref(null),
        latestElements: ref([]),
        latestFiles: ref({}),
        debouncedSave: ref(null),
        suspiciousBlankLoad: ref(false),
      },
    });
    useLayoutEffect(() => {
      onDrop = handleCanvasDropCapture;
    }, [handleCanvasDropCapture]);
    return null;
  };
  const renderer = create(<Harness />);
  const oversized = drawFile("big.excalidraw", drawing);
  Object.defineProperty(oversized, "size", { value: MAX_DROP_FILE_BYTES + 1 });
  const good = drawFile("good.excalidraw", {
    ...drawing,
    elements: [rectangle, image("shared")],
    files: { invalid: null, shared: asset("shared", "AQ==") },
  });
  const exceedsBatch = drawFile("over-batch.excalidraw", drawing);
  for (const file of [good, exceedsBatch]) {
    Object.defineProperty(file, "size", { value: MAX_DROP_FILE_BYTES });
  }
  const event = {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    clientX: 0,
    clientY: 0,
    dataTransfer: {
      files: [
        new File(["text"], "notes.txt"),
        oversized,
        drawFile("invalid.excalidraw", { ...drawing, elements: [null] }),
        good,
        new File(["image"], "photo.jpg", { type: "image/jpeg" }),
        exceedsBatch,
      ],
    },
  };
  await act(() => onDrop(event as unknown as React.DragEvent<HTMLDivElement>));
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(event.stopPropagation).toHaveBeenCalledOnce();
  expect(toast.error).toHaveBeenCalledWith(
    "Skipped unsupported file: notes.txt",
  );
  expect(toast.error).toHaveBeenCalledWith(
    "Skipped big.excalidraw: drop size limit exceeded",
  );
  expect(toast.error).toHaveBeenCalledWith(
    "Skipped over-batch.excalidraw: drop size limit exceeded",
  );
  expect(toast.error).toHaveBeenCalledWith(
    "Could not import invalid.excalidraw",
  );
  const elements = api.updateScene.mock.calls[0][0].elements;
  expect(elements).toHaveLength(4);
  expect(elements[0]).toBe(existing);
  expect(elements[1]).toMatchObject({ type: "rectangle" });
  expect(elements[1].id).not.toBe(rectangle.id);
  const remappedFileId = elements[2].fileId;
  expect(remappedFileId).not.toBe("shared");
  expect(elements[3]).toMatchObject({ type: "image", fileId: "photo" });
  expect(api.addFiles).toHaveBeenCalledWith([
    asset(remappedFileId, "AQ=="),
    expect.objectContaining({ id: "photo" }),
  ]);
  renderer.unmount();
});
