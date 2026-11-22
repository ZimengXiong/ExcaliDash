// Helpers that append a dropped Excalidraw scene to the open drawing.
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export const MAX_DROP_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_DROP_BYTES = 64 * 1024 * 1024;
const MAX_SCENE_BYTES = 32 * 1024 * 1024;
const MAX_SCENE_ELEMENTS = 10_000;
const SCENE_MIME_TYPE = "application/vnd.excalidraw+json";
const PNG_SCENE_KEYWORD = new TextEncoder().encode(`${SCENE_MIME_TYPE}\0`);

const fromByteString = (text: string) =>
  Uint8Array.from(text, (byte) => byte.charCodeAt(0));

const SCENE_TYPE_BY_EXTENSION: ReadonlyArray<[RegExp, string]> = [
  [/\.png$/i, "image/png"],
  [/\.svg$/i, "image/svg+xml"],
  [/\.excalidraw$/i, SCENE_MIME_TYPE],
  [/\.json$/i, "application/json"],
];
const SCENE_CARRYING_TYPES = new Set([
  "image/png",
  "image/svg+xml",
  SCENE_MIME_TYPE,
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireSize = (bytes: number, limit: number) => {
  if (bytes > limit) throw new Error("Drawing exceeds the drop size limit");
};

// Excalidraw stores the scene in a PNG tEXt chunk under its drawing MIME type.
const readPngMetadata = async (file: File): Promise<string | null> => {
  const view = new DataView(await file.arrayBuffer());
  if (
    view.byteLength < 8 ||
    view.getUint32(0) !== 0x89504e47 ||
    view.getUint32(4) !== 0x0d0a1a0a
  ) {
    throw new Error("Invalid PNG signature");
  }
  for (let offset = 8; offset + 12 <= view.byteLength;) {
    const size = view.getUint32(offset);
    const type = view.getUint32(offset + 4);
    const start = offset + 8;
    offset = start + size + 4;
    if (offset > view.byteLength) throw new Error("Invalid PNG chunk");
    if (type === 0x49454e44) break; // IEND
    if (type !== 0x74455874 || size < PNG_SCENE_KEYWORD.length) continue; // tEXt
    if (
      PNG_SCENE_KEYWORD.every((byte, i) => view.getUint8(start + i) === byte)
    ) {
      // The JSON in a PNG tEXt chunk uses Latin-1, including bytes 0x80–0x9f.
      const bytes = new Uint8Array(
        view.buffer,
        start + PNG_SCENE_KEYWORD.length,
        size - PNG_SCENE_KEYWORD.length,
      );
      let metadata = "";
      for (let i = 0; i < bytes.length; i += 8192) {
        metadata += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      return metadata;
    }
  }
  return null;
};

const readSvgMetadata = async (file: File): Promise<string | null> => {
  const svg = await file.text();
  if (!svg.includes(`payload-type:${SCENE_MIME_TYPE}`)) return null;
  const payload = svg.match(
    /<!-- payload-start -->\s*(\S+)\s*<!-- payload-end -->/,
  )?.[1];
  if (!payload) throw new Error("Invalid SVG drawing metadata");
  const version = svg.match(/<!-- payload-version:(\d+) -->/)?.[1] ?? "1";
  const decoded = atob(payload);
  return version === "1"
    ? new TextDecoder().decode(fromByteString(decoded))
    : decoded;
};

const inflateScene = async (
  bytes: Uint8Array<ArrayBuffer>,
  consume: (bytes: number) => void,
) => {
  let offset = 0;
  // Bound how much compressed input the browser can expand in one write.
  const input = new ReadableStream<Uint8Array<ArrayBuffer>>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.subarray(offset, offset + 4096));
      offset += 4096;
    },
  });
  const reader = input
    .pipeThrough(new DecompressionStream("deflate"))
    .getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      consume(value.byteLength);
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
};

// Read embedded metadata ourselves so a compressed scene is bounded before
// parsing or passing it to Excalidraw. Null means the image has no drawing.
export const readDroppedScene = async (
  file: File,
  budget: { remaining: number },
) => {
  requireSize(file.size, MAX_DROP_FILE_BYTES);
  let size = 0;
  const consume = (bytes: number, countPartial = false) => {
    const allowed = Math.min(MAX_SCENE_BYTES - size, budget.remaining);
    if (countPartial && bytes > allowed) budget.remaining -= allowed;
    requireSize(bytes, allowed);
    budget.remaining -= bytes;
    size += bytes;
  };
  const parse = (text: string) => ({ text, data: JSON.parse(text) as unknown });
  if (file.type !== "image/png" && file.type !== "image/svg+xml") {
    consume(file.size);
    return parse(await file.text());
  }

  const metadata = await (file.type === "image/png"
    ? readPngMetadata(file)
    : readSvgMetadata(file));
  if (metadata === null) return null;
  const data: unknown = JSON.parse(metadata);
  if (isRecord(data) && "encoded" in data) {
    if (data.encoding !== "bstring" || typeof data.encoded !== "string") {
      throw new Error("Invalid drawing encoding");
    }
    if (data.compressed === true) {
      requireSize(1, budget.remaining);
      // Count inflated bytes even if a later chunk exceeds the file limit.
      return parse(
        await inflateScene(fromByteString(data.encoded), (bytes) =>
          consume(bytes, true),
        ),
      );
    }
    consume(data.encoded.length);
    return parse(new TextDecoder().decode(fromByteString(data.encoded)));
  }
  consume(new TextEncoder().encode(metadata).byteLength);
  return { text: metadata, data };
};

export type DroppedSceneFile = {
  id: string;
  mimeType: string;
  dataURL: string;
  created: number;
  lastRetrieved?: number;
};

const isPoint = (value: unknown): boolean =>
  Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);

const isSceneElement = (element: unknown): element is ExcalidrawElement =>
  isRecord(element) &&
  typeof element.type === "string" &&
  (element.id == null || typeof element.id === "string") &&
  [element.x, element.y, element.width, element.height].every(
    Number.isFinite,
  ) &&
  (element.angle == null || Number.isFinite(element.angle)) &&
  (element.link == null || typeof element.link === "string") &&
  (element.groupIds == null ||
    (Array.isArray(element.groupIds) &&
      element.groupIds.every((id) => typeof id === "string"))) &&
  (element.boundElementIds == null || Array.isArray(element.boundElementIds)) &&
  (element.boundElements == null ||
    (Array.isArray(element.boundElements) &&
      element.boundElements.every(
        (bound) => isRecord(bound) && typeof bound.id === "string",
      ))) &&
  (element.points == null
    ? element.type !== "freedraw"
    : Array.isArray(element.points) && element.points.every(isPoint));

const readSceneFile = (id: string, value: unknown): DroppedSceneFile | null => {
  if (
    !/^[\w-]{1,200}$/.test(id) ||
    Object.hasOwn(Object.prototype, id) ||
    !isRecord(value) ||
    value.id !== id ||
    typeof value.mimeType !== "string" ||
    !/^image\/[\w.+-]+$/i.test(value.mimeType) ||
    typeof value.dataURL !== "string" ||
    typeof value.created !== "number" ||
    !Number.isFinite(value.created)
  )
    return null;
  const prefix = `data:${value.mimeType};base64,`;
  if (
    value.dataURL.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase()
  )
    return null;
  const payload = value.dataURL.slice(prefix.length);
  const unpadded = payload.replace(/={1,2}$/, "");
  if (
    unpadded.length < 2 ||
    unpadded.length % 4 === 1 ||
    (unpadded.length !== payload.length && payload.length % 4 !== 0) ||
    !/^[A-Za-z0-9+/]+$/.test(unpadded) ||
    /\s$/.test(unpadded)
  )
    return null;
  return {
    id,
    mimeType: value.mimeType,
    dataURL: value.dataURL,
    created: value.created,
    ...(typeof value.lastRetrieved === "number" &&
    Number.isFinite(value.lastRetrieved)
      ? { lastRetrieved: value.lastRetrieved }
      : {}),
  };
};

export const validateDroppedScene = (data: unknown) => {
  if (!isRecord(data)) throw new Error("Invalid drawing");
  if (
    data.type === "excalidrawlib" &&
    (data.version === 1 || data.version === 2)
  ) {
    return { type: "library" } as const;
  }
  if (
    data.type !== "excalidraw" ||
    !Array.isArray(data.elements) ||
    data.elements.length > MAX_SCENE_ELEMENTS ||
    !data.elements.every(isSceneElement)
  ) {
    throw new Error("Invalid drawing elements");
  }

  const files = new Map<string, DroppedSceneFile>();
  if (isRecord(data.files)) {
    for (const [id, value] of Object.entries(data.files)) {
      const file = readSceneFile(id, value);
      if (file) files.set(id, file);
    }
  }
  const elements = data.elements.filter(
    (element) =>
      !element.isDeleted &&
      (element.type !== "image" || files.has(element.fileId ?? "")),
  );
  return {
    type: "scene",
    elements,
    files: [...files.values()],
    source: typeof data.source === "string" ? data.source : undefined,
  } as const;
};

// A renamed asset can be reused by another file in the same drop if both
// supplied identical content under the same original id.
export const createDroppedFileMerger = (
  existing: Record<string, DroppedSceneFile>,
  reservedIds: Iterable<string>,
  createId: () => string,
) => {
  const occupied = new Map<string, DroppedSceneFile | undefined>(
    Object.entries(existing),
  );
  for (const id of reservedIds) {
    if (!occupied.has(id)) occupied.set(id, undefined);
  }
  const renamed = new Map<string, Map<string, DroppedSceneFile>>();
  const files: DroppedSceneFile[] = [];
  const sameContent = (a: DroppedSceneFile, b?: DroppedSceneFile) =>
    b?.mimeType === a.mimeType && b.dataURL === a.dataURL;

  const merge = (incoming: readonly DroppedSceneFile[]) => {
    const remapped = new Map<string, string>();
    for (const file of incoming) {
      const original = file.id;
      let id = original;
      if (occupied.has(id)) {
        if (sameContent(file, occupied.get(id))) continue;
        let variants = renamed.get(original);
        if (!variants) renamed.set(original, (variants = new Map()));
        const match = variants.get(file.dataURL);
        if (match && match.mimeType === file.mimeType) {
          remapped.set(original, match.id);
          continue;
        }
        do {
          id = createId();
        } while (occupied.has(id));
        remapped.set(original, id);
        variants.set(file.dataURL, { ...file, id });
      }
      const stored = id === original ? file : { ...file, id };
      occupied.set(id, stored);
      files.push(stored);
    }
    return remapped;
  };
  return { files, merge };
};

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
const DRAWING_PATH = /^\/(?:editor|shared)\/[^/]+\/?$/;

const remapElementLink = (
  link: string,
  destination: URL,
  source: URL,
  remap: (id: string) => string | undefined,
): string => {
  let url: URL;
  try {
    url = new URL(link, source);
  } catch {
    return link;
  }
  if (url.origin !== source.origin) return link;
  // Standard exports record the origin only. With a full source URL, also
  // require the source drawing's path. Origin-only exports carry links to
  // ExcaliDash drawing routes or to the standalone Excalidraw root.
  if (!(
    link.startsWith("?") ||
    (source.pathname !== "/"
      ? url.pathname === source.pathname
      : DRAWING_PATH.test(url.pathname) ||
        (url.pathname === "/" && source.origin !== destination.origin))
  )) {
    return link;
  }
  const target = url.searchParams.get(ELEMENT_LINK_KEY);
  const next = target == null ? undefined : remap(target);
  if (!next) return link;
  const rebased = new URL(destination);
  rebased.searchParams.set(ELEMENT_LINK_KEY, next);
  return rebased.toString();
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
    destination,
    source,
    fileIds,
  }: {
    bounds: Bounds;
    origin: { x: number; y: number };
    createId: () => string;
    destination: URL;
    source?: string;
    fileIds?: ReadonlyMap<string, string>;
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
  let sourceUrl = new URL(destination.origin);
  if (source) {
    try {
      const candidate = new URL(source);
      if (candidate.protocol === "https:" || candidate.protocol === "http:") {
        candidate.search = "";
        candidate.hash = "";
        sourceUrl = candidate;
      }
    } catch {
      // Some exports omit an absolute source URL.
    }
  }

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
    if (typeof element.fileId === "string") {
      next.fileId = fileIds?.get(element.fileId) ?? element.fileId;
    }
    if (typeof element.link === "string") {
      next.link = remapElementLink(
        element.link,
        destination,
        sourceUrl,
        (id) => elementIds.get(id) ?? groupIds.get(id),
      );
    }
    return next;
  });
};
