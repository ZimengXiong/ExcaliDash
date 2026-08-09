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

/**
 * Split into what a reader sees as one character.
 *
 * `length` and `slice` work on UTF-16 code units, so cutting a line at a fixed
 * count lands in the middle of anything outside the basic plane: an emoji comes
 * apart into two lone surrogates, one at the end of a line and one at the start
 * of the next, and the stored label holds broken characters. Intl.Segmenter
 * groups combining marks and ZWJ sequences too; the code point split is a
 * fallback for a runtime without it.
 */
const graphemes = (text: string): string[] => {
  const Segmenter = (
    Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => {
      segment: (s: string) => Iterable<{ segment: string }>;
    } }
  ).Segmenter;
  if (!Segmenter) return Array.from(text);
  const segmenter = new Segmenter(undefined, { granularity: "grapheme" });
  return [...segmenter.segment(text)].map((part) => part.segment);
};

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
    let line: string[] = [];
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      // A word longer than the line is split rather than left to widen the box:
      // without this, one long unbroken token sizes the box to its full length.
      let rest = graphemes(word);
      while (rest.length > maxChars) {
        if (line.length) {
          lines.push(line.join(""));
          line = [];
        }
        lines.push(rest.slice(0, maxChars).join(""));
        rest = rest.slice(maxChars);
      }
      const candidate = line.length ? [...line, " ", ...rest] : rest;
      if (candidate.length > maxChars && line.length) {
        lines.push(line.join(""));
        line = rest;
      } else {
        line = candidate;
      }
    }
    lines.push(line.join(""));
  }
  return lines;
};

/** Length in what a reader counts as characters, matching how wrapLabel cuts. */
export const visibleLength = (text: string): number => graphemes(text).length;

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
  const longest = lines.reduce((max, line) => Math.max(max, visibleLength(line)), 0);
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
