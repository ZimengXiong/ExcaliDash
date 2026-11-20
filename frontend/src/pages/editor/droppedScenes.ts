// Helpers that append a dropped Excalidraw scene to the open drawing.
// Without them, Excalidraw replaces the canvas with the scene.
// A scene arrives as an `.excalidraw` or `.json` file, or as a PNG or SVG
// export with the scene embedded.
//
// This file imports nothing from `@excalidraw/excalidraw`, so unit tests can
// run the id remapping without a DOM.
// The caller supplies scene bounds and fresh ids.

// The MIME type Excalidraw needs to decode each scene-carrying extension.
const SCENE_TYPE_BY_EXTENSION: ReadonlyArray<[RegExp, string]> = [
  [/\.png$/i, "image/png"],
  [/\.svg$/i, "image/svg+xml"],
  [/\.excalidraw$/i, "application/vnd.excalidraw+json"],
  [/\.json$/i, "application/json"],
];
const SCENE_CARRYING_TYPES = new Set([
  "image/png",
  "image/svg+xml",
  "application/vnd.excalidraw+json",
  "application/json",
]);

const sceneTypeFromName = (name: string): string | undefined =>
  SCENE_TYPE_BY_EXTENSION.find(([pattern]) => pattern.test(name))?.[1];

/**
 * True when a dropped file may hold an Excalidraw scene.
 * Any PNG, SVG or JSON file qualifies: Excalidraw embeds scenes in image
 * exports whatever their file name, and saves scenes as `.json` too.
 * Only decoding tells you whether a scene is present.
 */
export const mayContainExcalidrawScene = (file: File): boolean =>
  sceneTypeFromName(file.name || "") !== undefined ||
  SCENE_CARRYING_TYPES.has(file.type);

/**
 * Excalidraw picks a decoder from a blob's MIME type alone.
 * A drag source can send a file with no type, or with a generic one such as
 * `application/octet-stream`.
 * Take the type from a known extension, whatever the drag source said.
 */
export const withSceneMimeType = (file: File): File => {
  const name = file.name || "";
  const type = sceneTypeFromName(name);
  return type && type !== file.type
    ? new File([file], name, { type, lastModified: file.lastModified })
    : file;
};

/**
 * Excalidraw reports "this image has no scene in it" with this error code.
 * Its other image errors share the EncodingError name but mean the embedded
 * scene is corrupt.
 * Report those as failures instead of inserting the file as a plain image.
 */
export const isMissingSceneError = (error: unknown): boolean =>
  (error as { code?: unknown } | null)?.code ===
  "IMAGE_NOT_CONTAINS_SCENE_DATA";

type Bounds = readonly [minX: number, minY: number, maxX: number, maxY: number];

// Excalidraw links to an element or group by adding `?element=<id>` to the
// drawing's URL.
// See defaultGetElementLinkFromSelection in @excalidraw/excalidraw.
const ELEMENT_LINK_KEY = "element";

/**
 * Point an element link at the target's new id.
 * Return links to anything outside the dropped scene, and strings that do not
 * parse as URLs, unchanged.
 */
const remapElementLink = (
  link: string,
  remap: (id: string) => string | undefined,
): string => {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return link;
  }
  const target = url.searchParams.get(ELEMENT_LINK_KEY);
  const next = target == null ? undefined : remap(target);
  if (!next) return link;
  url.searchParams.set(ELEMENT_LINK_KEY, next);
  return url.toString();
};

/**
 * Give every element and group in `elements` a fresh id, rewrite the
 * references between them, element links included, and move the scene so its
 * top-left corner lands at `origin`.
 *
 * Without fresh ids, a dropped element that shares an id with one on the
 * canvas overwrites it, and a second drop of the same file collides with the
 * first.
 * Clearing fractional indices makes Excalidraw assign ones that sort after the
 * existing scene.
 */
export const prepareSceneElementsForAppend = (
  elements: readonly any[],
  {
    bounds,
    origin,
    createId,
  }: {
    bounds: Bounds;
    origin: { x: number; y: number };
    createId: () => string;
  },
): any[] => {
  const live = elements.filter((element) => !element?.isDeleted);
  const elementIds = new Map<string, string>();
  const groupIds = new Map<string, string>();
  for (const element of live) {
    elementIds.set(element.id, createId());
    for (const groupId of element.groupIds ?? []) {
      if (!groupIds.has(groupId)) groupIds.set(groupId, createId());
    }
  }
  const remapId = (id: string | null | undefined) =>
    id == null ? id : (elementIds.get(id) ?? null);
  const remapBinding = (binding: any) => {
    if (!binding) return binding;
    const elementId = elementIds.get(binding.elementId);
    return elementId ? { ...binding, elementId } : null;
  };
  const dx = origin.x - bounds[0];
  const dy = origin.y - bounds[1];

  return live.map((element) => {
    const next: any = {
      ...element,
      id: elementIds.get(element.id),
      x: element.x + dx,
      y: element.y + dy,
      index: null,
      groupIds: (element.groupIds ?? []).map((id: string) => groupIds.get(id)),
    };
    if ("frameId" in element) next.frameId = remapId(element.frameId);
    if ("containerId" in element) {
      next.containerId = remapId(element.containerId);
    }
    if (Array.isArray(element.boundElements)) {
      next.boundElements = element.boundElements
        .map((bound: any) => {
          const id = elementIds.get(bound?.id);
          return id ? { ...bound, id } : null;
        })
        .filter(Boolean);
    }
    if ("startBinding" in element) {
      next.startBinding = remapBinding(element.startBinding);
    }
    if ("endBinding" in element) {
      next.endBinding = remapBinding(element.endBinding);
    }
    if (typeof element.link === "string") {
      next.link = remapElementLink(
        element.link,
        (id) => elementIds.get(id) ?? groupIds.get(id),
      );
    }
    return next;
  });
};
