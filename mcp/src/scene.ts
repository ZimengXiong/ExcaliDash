import { createHash, randomUUID, randomInt } from "node:crypto";
export type Element = Record<string, unknown> & { id: string; type: string };
export type SceneFile = Record<string, unknown> & {
  id: string;
  mimeType: string;
  dataURL: string;
  created?: number;
};
export type SceneData = {
  id: string;
  version: number;
  elements: Element[];
  appState: Record<string, unknown>;
  files: Record<string, SceneFile>;
};
export type FindInput = {
  id?: string;
  type?: string;
  text?: string;
  limit: number;
  offset: number;
};
export const findElements = (scene: SceneData, q: FindInput) => {
  const matches = scene.elements.filter(
    (e) =>
      e.isDeleted !== true &&
      (q.id === undefined || e.id === q.id) &&
      (q.type === undefined || e.type === q.type) &&
      (q.text === undefined ||
        (typeof e.text === "string" && e.text.includes(q.text))),
  );
  return {
    drawingId: scene.id,
    version: scene.version,
    elements: matches.slice(q.offset, q.offset + q.limit),
    totalCount: matches.length,
    limit: q.limit,
    offset: q.offset,
  };
};
export type ImageInput = {
  mimeType: "image/png" | "image/jpeg";
  base64: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type ImagePatch = {
  version: number;
  elements: Element[];
  files: Record<string, SceneFile>;
};
export type PreparedImage = {
  fileId: string;
  mimeType: ImageInput["mimeType"];
  dataURL: string;
};
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_BASE64 = 4 * Math.ceil(MAX_IMAGE_BYTES / 3);
export function decodeImage(input: ImageInput): PreparedImage {
  const b64 = input.base64;
  if (
    !b64 ||
    b64.length > MAX_IMAGE_BASE64 ||
    b64.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      b64,
    )
  )
    throw new Error("Invalid or oversized base64 image");
  const bytes = Buffer.from(b64, "base64");
  if (
    !bytes.length ||
    bytes.length > MAX_IMAGE_BYTES ||
    bytes.toString("base64") !== b64
  )
    throw new Error("Invalid or oversized image");
  const png = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg =
    bytes.length >= 4 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255 &&
    bytes[bytes.length - 2] === 255 &&
    bytes[bytes.length - 1] === 217;
  if (
    (input.mimeType === "image/png" && !png) ||
    (input.mimeType === "image/jpeg" && !jpeg)
  )
    throw new Error("Image signature does not match MIME type");
  return {
    fileId: createHash("sha256").update(bytes).digest("hex"),
    mimeType: input.mimeType,
    dataURL: `data:${input.mimeType};base64,${b64}`,
  };
}
export function appendImage(
  scene: SceneData,
  input: ImageInput,
  image: PreparedImage,
): { patch: ImagePatch; elementId: string; fileId: string } {
  const { fileId, mimeType, dataURL } = image;
  const existing = scene.files[fileId];
  if (existing && existing.mimeType !== mimeType)
    throw new Error("Existing file MIME conflict");
  const elementId = randomUUID(),
    now = Date.now();
  const element: Element = {
    id: elementId,
    type: "image",
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    angle: 0,
    strokeColor: "transparent",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    boundElements: null,
    seed: randomInt(0, 2 ** 31),
    version: 1,
    versionNonce: randomInt(0, 2 ** 31),
    isDeleted: false,
    updated: now,
    link: null,
    locked: false,
    fileId,
    status: "saved",
    scale: [1, 1],
    crop: null,
  };
  const files: Record<string, SceneFile> = existing
    ? {}
    : {
        [fileId]: {
          id: fileId,
          mimeType,
          dataURL,
          created: now,
          lastRetrieved: now,
        },
      };
  return {
    patch: {
      version: scene.version,
      elements: [...scene.elements, element],
      files,
    },
    elementId,
    fileId,
  };
}
