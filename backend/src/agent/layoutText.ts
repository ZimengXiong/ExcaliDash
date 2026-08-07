/**
 * Text metrics for laid-out nodes and edge labels.
 *
 * Excalidraw measures text in the browser; the server has to approximate it, so
 * these ratios are deliberately generous: a box a little too wide reads fine,
 * one that is too narrow clips its label.
 */

export const CHAR_WIDTH_RATIO = 0.58;
const LINE_HEIGHT = 1.25;
const LABEL_PADDING_X = 32;
const LABEL_PADDING_Y = 28;

const MIN_NODE_WIDTH = 140;
const MIN_NODE_HEIGHT = 60;
const MAX_NODE_WIDTH = 260;

export const DEFAULT_NODE_FONT_SIZE = 16;
export const EDGE_LABEL_FONT_SIZE = 14;

/** Wrap a label so a long one becomes a readable block rather than a wide strip. */
export const wrapLabel = (
  text: string,
  fontSize: number,
  maxWidth: number = MAX_NODE_WIDTH,
): string[] => {
  const maxChars = Math.max(
    8,
    Math.floor((maxWidth - LABEL_PADDING_X) / (fontSize * CHAR_WIDTH_RATIO)),
  );
  const lines: string[] = [];
  for (const paragraph of String(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      // A word longer than the line is split rather than left to widen the box:
      // without this, one long unbroken token sizes the box to its full length.
      let rest = word;
      while (rest.length > maxChars) {
        if (line) {
          lines.push(line);
          line = "";
        }
        lines.push(rest.slice(0, maxChars));
        rest = rest.slice(maxChars);
      }
      const candidate = line ? `${line} ${rest}` : rest;
      if (candidate.length > maxChars && line) {
        lines.push(line);
        line = rest;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
};

/** Box dimensions that actually fit the label, rather than a fixed default. */
export const measureNode = (
  text: string | undefined,
  fontSize: number,
): { text?: string; width: number; height: number } => {
  // A whitespace-only label carries no text, so it is treated as no label at all
  // rather than producing an empty bound text element.
  if (!text || !text.trim()) {
    return { width: MIN_NODE_WIDTH, height: MIN_NODE_HEIGHT };
  }
  const lines = wrapLabel(text, fontSize);
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  return {
    text: lines.join("\n"),
    width: Math.max(
      MIN_NODE_WIDTH,
      Math.round(longest * fontSize * CHAR_WIDTH_RATIO + LABEL_PADDING_X),
    ),
    height: Math.max(
      MIN_NODE_HEIGHT,
      Math.round(lines.length * fontSize * LINE_HEIGHT + LABEL_PADDING_Y),
    ),
  };
};
