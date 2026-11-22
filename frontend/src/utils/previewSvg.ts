import { blobToDataUrl } from "./dataUrls";
import {
  shrinkImageBlob,
  shrinkImageDataUrl,
  thumbnailTargetPx,
} from "./previewThumbnails";
import { isRehydratableRef } from "./rehydrateFiles";
import { SCENE_RASTER_IMAGE_ID } from "./renderPreview";

const MAX_PREVIEW_FETCHES = 3;
let activePreviewFetches = 0;
const previewQueue: Array<() => void> = [];

export const queuePreviewFetch = <T>(
  signal: AbortSignal,
  fetchPreview: () => Promise<T>,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const abort = () => {
      const index = previewQueue.indexOf(start);
      if (index !== -1) previewQueue.splice(index, 1);
      reject(signal.reason);
    };
    const start = async () => {
      signal.removeEventListener("abort", abort);
      activePreviewFetches++;
      try {
        resolve(await fetchPreview());
      } catch (error) {
        reject(error);
      } finally {
        activePreviewFetches--;
        previewQueue.shift()?.();
      }
    };
    if (activePreviewFetches < MAX_PREVIEW_FETCHES) {
      void start();
    } else {
      signal.addEventListener("abort", abort, { once: true });
      previewQueue.push(start);
    }
  });

export const isDefaultPreviewBackground = (color?: string | null): boolean =>
  !color || ["white", "#fff", "#ffffff"].includes(color.trim().toLowerCase());

const parseDimension = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const parseCoordinate = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseViewBox = (
  value: string | null,
): { width: number; height: number } | null => {
  if (!value) return null;
  const parts = value
    .trim()
    .split(/[,\s]+/)
    .map((part) => Number.parseFloat(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part)))
    return null;
  const [, , width, height] = parts;
  if (width <= 0 || height <= 0) return null;
  return { width, height };
};

const isNear = (a: number, b: number, epsilon = 0.5): boolean =>
  Math.abs(a - b) <= epsilon;

const maybeRepairFlattenedImagePreview = (svg: Element) => {
  const rootImage = Array.from(svg.children).find(
    (child) =>
      child.tagName.toLowerCase() === "image" &&
      /^(100%|1(?:\.0+)?%?)$/i.test(child.getAttribute("width") ?? "") &&
      /^(100%|1(?:\.0+)?%?)$/i.test(child.getAttribute("height") ?? "") &&
      /^data:image\//i.test(
        child.getAttribute("href") ?? child.getAttribute("xlink:href") ?? "",
      ),
  );
  if (!rootImage) return;

  const hasPattern = svg.querySelector("pattern") !== null;
  const hasUrlFill = Array.from(svg.querySelectorAll("[fill]")).some((node) =>
    /^url\(#/i.test(node.getAttribute("fill") ?? ""),
  );
  if (hasPattern || hasUrlFill) return;

  const viewBox = parseViewBox(svg.getAttribute("viewBox"));
  const fallbackWidth = parseDimension(svg.getAttribute("width"));
  const fallbackHeight = parseDimension(svg.getAttribute("height"));
  const canvasWidth = viewBox?.width ?? fallbackWidth;
  const canvasHeight = viewBox?.height ?? fallbackHeight;
  if (!canvasWidth || !canvasHeight) return;

  const candidateRect = Array.from(svg.children).find((child) => {
    if (child.tagName.toLowerCase() !== "rect") return false;
    const fill = (child.getAttribute("fill") || "").trim().toLowerCase();
    if (fill !== "#fff" && fill !== "#ffffff" && fill !== "white") return false;
    const x = parseCoordinate(child.getAttribute("x"));
    const y = parseCoordinate(child.getAttribute("y"));
    const width = parseDimension(child.getAttribute("width"));
    const height = parseDimension(child.getAttribute("height"));
    if (x !== 0 || y !== 0 || !width || !height) return false;
    return isNear(width, canvasWidth) && isNear(height, canvasHeight);
  });

  if (candidateRect) {
    candidateRect.setAttribute("fill", "transparent");
  }
};

const absoluteLength = (value: string | null): number | null =>
  value && !value.trim().endsWith("%") ? parseDimension(value) : null;

/** Longest edge, in scene units, at which a preview `<image>` is drawn. */
const displayedImageSize = (svg: Element, image: Element): number | null => {
  const sizeOf = (node: Element) =>
    Math.max(
      absoluteLength(node.getAttribute("width")) ?? 0,
      absoluteLength(node.getAttribute("height")) ?? 0,
    );
  const symbol = image.closest("symbol");
  if (!symbol) return sizeOf(image) || null;
  // Cropped images only show part of the symbol's bitmap.
  if (!symbol.id || symbol.hasAttribute("viewBox")) return null;
  let size = 0;
  for (const use of svg.querySelectorAll("use")) {
    const href = use.getAttribute("href") || use.getAttribute("xlink:href");
    if (href === `#${symbol.id}`) size = Math.max(size, sizeOf(use));
  }
  return size || null;
};

const fetchPreviewImage = async (
  url: string,
  target: number,
  signal: AbortSignal,
): Promise<string | null> => {
  try {
    const response = await fetch(url, { credentials: "same-origin", signal });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (signal.aborted) return null;
    return (await shrinkImageBlob(blob, target)) ?? (await blobToDataUrl(blob));
  } catch {
    return null;
  }
};

const parsePreviewSvg = (preview: string): Element | null => {
  try {
    const { documentElement: svg } = new DOMParser().parseFromString(
      preview,
      "image/svg+xml",
    );
    return svg?.localName === "svg" && !svg.querySelector("parsererror")
      ? svg
      : null;
  } catch {
    return null;
  }
};

// A null result means a legacy preview needs to be rebuilt from the scene.
export const prepareStoredPreview = async (
  preview: string,
  signal: AbortSignal,
): Promise<string | null> => {
  const svg = parsePreviewSvg(preview);
  if (!svg) return null;

  // Older sanitization removed Excalidraw's symbol/use pairs but left their
  // images in defs. Those thumbnails must be rebuilt from the actual scene.
  if (svg.querySelector("defs > image")) return null;

  // Inline each distinct stored reference once so authenticated and
  // redirected images render inside the SVG. Originals can be several MB
  // each; inlining them made every dashboard mount parse ~50 MB of markup,
  // so each is downscaled to the size it occupies in the card.
  const references = new Map<string, Element[]>();
  for (const image of svg.querySelectorAll("image")) {
    const href = image.getAttribute("href") || image.getAttribute("xlink:href");
    if (!href) return null;
    if (!isRehydratableRef(href) && !/^data:image\/svg\+xml[;,]/i.test(href))
      continue;
    const images = references.get(href);
    if (images) images.push(image);
    else references.set(href, [image]);
  }

  if (references.size > 0) {
    const bounds = parseViewBox(svg.getAttribute("viewBox"));
    const sceneSize = bounds ? Math.max(bounds.width, bounds.height) : 0;
    const inlined = await Promise.all(
      Array.from(references, async ([url, images]) => {
        const size = Math.max(
          ...images.map((image) => displayedImageSize(svg, image) ?? Infinity),
        );
        const target =
          sceneSize && Number.isFinite(size)
            ? thumbnailTargetPx(size, sceneSize)
            : 512;
        const dataURL = await queuePreviewFetch(signal, async () => {
          if (isRehydratableRef(url))
            return fetchPreviewImage(url, target, signal);
          return (
            (await shrinkImageDataUrl(url, "image/svg+xml", target)) ?? url
          );
        }).catch(() => null);
        return [images, dataURL] as const;
      }),
    );
    if (signal.aborted) return null;
    for (const [images, dataURL] of inlined) {
      if (!dataURL?.startsWith("data:image/")) return null;
      for (const image of images) {
        image.setAttribute("href", dataURL);
        image.removeAttribute("xlink:href");
      }
    }
  }
  return normalizeSvgElement(svg);
};

let previewScopeCounter = 0;

/** A prefix unique to one inline preview in this document. */
export const createPreviewIdScope = (drawingId: string): string =>
  `p${++previewScopeCounter}-${drawingId.replace(/[^A-Za-z0-9_-]/g, "")}-`;

/**
 * Inline SVGs share the document's id namespace. Excalidraw names image
 * symbols after their fileId, so two cards whose different images share a
 * fileId would paint each other's bitmap. Prefix every id and every internal
 * reference to it (`href="#…"`, `xlink:href="#…"`, `url(#…)`).
 * Input is serializer output (normalizeSvgElement), so attributes are
 * double-quoted.
 */
export const scopePreviewSvgIds = (svg: string, prefix: string): string => {
  const ids = new Set<string>();
  for (const match of svg.matchAll(/\sid="([^"]+)"/g)) ids.add(match[1]);
  if (ids.size === 0) return svg;
  return svg
    .replace(/(\sid=")([^"]+)(")/g, `$1${prefix}$2$3`)
    .replace(/(\s(?:xlink:)?href="#)([^"]+)(")/g, (all, start, id, end) =>
      ids.has(id) ? `${start}${prefix}${id}${end}` : all,
    )
    .replace(
      /url\((&quot;|'|")?#([^)'"&\s]+)(&quot;|'|")?\)/g,
      (all, open = "", id, close = "") =>
        ids.has(id) ? `url(${open}#${prefix}${id}${close})` : all,
    );
};

export const normalizePreviewSvg = (
  preview: string | null | undefined,
): string | null => {
  const svg = preview ? parsePreviewSvg(preview) : null;
  return svg ? normalizeSvgElement(svg) : null;
};

export const normalizeSvgElement = (svg: Element): string => {
  if (!svg.hasAttribute("viewBox")) {
    const backgroundRect = svg.querySelector("rect[x='0'][y='0']");
    const width =
      parseDimension(backgroundRect?.getAttribute("width") ?? null) ??
      parseDimension(svg.getAttribute("width"));
    const height =
      parseDimension(backgroundRect?.getAttribute("height") ?? null) ??
      parseDimension(svg.getAttribute("height"));

    if (width && height) {
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }
  }

  if (!svg.hasAttribute("preserveAspectRatio")) {
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  }

  maybeRepairFlattenedImagePreview(svg);

  // Excalidraw puts the canvas rect before all scene artwork. Only remove
  // its default white fill, never white shapes or explicitly colored canvases.
  const firstDrawable = Array.from(svg.children).find(
    (node) =>
      !["metadata", "defs", "style", "title", "desc"].includes(
        node.tagName.toLowerCase(),
      ),
  );
  const bounds = parseViewBox(svg.getAttribute("viewBox"));
  if (
    firstDrawable?.tagName.toLowerCase() === "rect" &&
    bounds &&
    firstDrawable.hasAttribute("fill") &&
    isDefaultPreviewBackground(firstDrawable.getAttribute("fill")) &&
    firstDrawable.getAttribute("x") === "0" &&
    firstDrawable.getAttribute("y") === "0" &&
    isNear(
      parseDimension(firstDrawable.getAttribute("width")) ?? -1,
      bounds.width,
    ) &&
    isNear(
      parseDimension(firstDrawable.getAttribute("height")) ?? -1,
      bounds.height,
    )
  ) {
    firstDrawable.setAttribute("fill", "transparent");
  }

  // Match Excalidraw's SVG exporter, but let the app's theme own presentation.
  // Strip its known legacy export filters to avoid applying dark mode twice.
  if (svg.getAttribute("filter") === "invert(93%) hue-rotate(180deg)") {
    svg.removeAttribute("filter");
  }
  for (const node of svg.querySelectorAll("use, image")) {
    if (
      node.getAttribute("filter") ===
      "invert(100%) hue-rotate(180deg) saturate(1.25)"
    )
      node.removeAttribute("filter");
    const href =
      node.getAttribute("href") || node.getAttribute("xlink:href") || "";
    const reference = href.startsWith("#") ? href.slice(1) : "";
    const image =
      node.tagName.toLowerCase() === "image"
        ? node
        : reference
          ? (svg instanceof SVGSVGElement
              ? svg.getElementById(reference)
              : svg.ownerDocument.getElementById(reference)
            )?.querySelector("image")
          : null;
    const source =
      image?.getAttribute("href") || image?.getAttribute("xlink:href") || "";
    if (
      /^data:image\//i.test(source) &&
      !node.closest("defs") &&
      // A whole-scene raster thumbnail is themed like vector content.
      node.getAttribute("id") !== SCENE_RASTER_IMAGE_ID
    ) {
      node.setAttribute("data-preview-raster", "true");
    }
  }

  return svg.outerHTML;
};
