import { describe, expect, it } from "vitest";
import {
  isMissingSceneError,
  mayContainExcalidrawScene,
  prepareSceneElementsForAppend,
  withSceneMimeType,
} from "../src/pages/editor/droppedScenes";

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
  const base = "https://dash.example/editor/abc";
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
      link: "https://example.com/?element=elsewhere",
    },
    {
      id: "plain",
      type: "rectangle",
      x: 0,
      y: 0,
      groupIds: [],
      link: "not a url",
    },
  ];
  const prepared = prepareSceneElementsForAppend(linked, {
    bounds: [0, 0, 10, 10],
    origin: { x: 0, y: 0 },
    createId: sequentialIds(),
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
    expect(prepared[1].link.startsWith(base)).toBe(true);
  });

  it("leaves links to anything outside the scene alone", () => {
    expect(prepared[3].link).toBe("https://example.com/?element=elsewhere");
    expect(prepared[4].link).toBe("not a url");
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

  it("recognises Excalidraw's missing-scene error", () => {
    expect(
      isMissingSceneError(
        Object.assign(new Error("Image doesn't contain scene"), {
          name: "EncodingError",
          code: "IMAGE_NOT_CONTAINS_SCENE_DATA",
        }),
      ),
    ).toBe(true);
    expect(isMissingSceneError(new Error("Error: invalid file"))).toBe(false);
    expect(
      isMissingSceneError(
        Object.assign(new Error("Error: cannot restore image"), {
          name: "EncodingError",
          code: "IMAGE_SCENE_DATA_ERROR",
        }),
      ),
    ).toBe(false);
  });
});
