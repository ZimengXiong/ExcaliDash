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

const parseViewBox = (value: string | null): { width: number; height: number } | null => {
  if (!value) return null;
  const parts = value.trim().split(/[,\s]+/).map((part) => Number.parseFloat(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  const [, , width, height] = parts;
  if (width <= 0 || height <= 0) return null;
  return { width, height };
};

const isNear = (a: number, b: number, epsilon = 0.5): boolean => Math.abs(a - b) <= epsilon;

const maybeRepairFlattenedImagePreview = (svg: SVGSVGElement) => {
  const rootImage = Array.from(svg.children).find(
    (child) =>
      child.tagName.toLowerCase() === "image" &&
      /^(100%|1(?:\.0+)?%?)$/i.test(child.getAttribute("width") ?? "") &&
      /^(100%|1(?:\.0+)?%?)$/i.test(child.getAttribute("height") ?? "") &&
      /^data:image\//i.test(child.getAttribute("href") ?? child.getAttribute("xlink:href") ?? "")
  );
  if (!rootImage) return;

  const hasPattern = svg.querySelector("pattern") !== null;
  const hasUrlFill = Array.from(svg.querySelectorAll("[fill]")).some((node) =>
    /^url\(#/i.test(node.getAttribute("fill") ?? "")
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

export const previewHasEmbeddedImages = (
  preview: string | null | undefined
): boolean => typeof preview === "string" && /<image[\s>]/i.test(preview);

export const isPreviewImageDataUrl = (
  preview: string | null | undefined
): boolean =>
  typeof preview === "string" &&
  /^data:image\/(?:webp|png|jpe?g);base64,[a-z0-9+/=\s]+$/i.test(preview.trim());

export const isPreviewSvgMarkup = (
  preview: string | null | undefined
): boolean => typeof preview === "string" && /^\s*<svg[\s>]/i.test(preview);

export const normalizePreviewSvg = (preview: string | null | undefined): string | null => {
  if (typeof preview !== "string" || preview.trim().length === 0) {
    return preview ?? null;
  }

  if (isPreviewImageDataUrl(preview)) {
    return preview.trim();
  }

  if (!isPreviewSvgMarkup(preview)) {
    return null;
  }

  if (typeof DOMParser === "undefined") {
    return preview;
  }

  try {
    const doc = new DOMParser().parseFromString(preview, "image/svg+xml");
    const svg = doc.documentElement;
    if (!svg || svg.tagName.toLowerCase() !== "svg") {
      return preview;
    }

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

    maybeRepairFlattenedImagePreview(svg as unknown as SVGSVGElement);

    return svg.outerHTML;
  } catch {
    return preview;
  }
};
