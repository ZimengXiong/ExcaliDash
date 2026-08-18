import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";

/**
 * Version history stores a full copy of `elements`, `appState` and `files` on
 * every scene update. Those copies are JSON and highly repetitive — every
 * element repeats the same ~25 keys — so a single board can turn a few dozen
 * edits into hundreds of megabytes.
 *
 * Snapshot payloads are therefore stored Brotli-compressed and base64-encoded
 * behind a version marker. Quality 5 is deliberate: on real payloads it lands
 * within a few percent of quality 11 while staying at single-digit
 * milliseconds, and the encode happens inside the write transaction.
 */
const PREFIX = "br1:";

/** Quality 11 is ~170x slower for ~2% more; the write path cannot afford it. */
const QUALITY = 5;

export const isEncodedSnapshotField = (value: string): boolean =>
  value.startsWith(PREFIX);

/**
 * Compress a snapshot payload. Returns the value unchanged when compression is
 * disabled or would not pay off, so callers can always store what they get.
 */
export const encodeSnapshotField = (
  value: string,
  enabled: boolean = true,
): string => {
  if (!enabled || !value) return value;
  // Already encoded: never wrap twice.
  if (isEncodedSnapshotField(value)) return value;

  try {
    const compressed = brotliCompressSync(Buffer.from(value, "utf8"), {
      params: { [constants.BROTLI_PARAM_QUALITY]: QUALITY },
    });
    const encoded = PREFIX + compressed.toString("base64");
    // Tiny payloads grow through base64; keep the plain text in that case.
    return encoded.length < value.length ? encoded : value;
  } catch (error) {
    console.warn("Snapshot compression failed, storing raw payload", { error });
    return value;
  }
};

/**
 * Decompress a snapshot payload. Values written before compression was enabled
 * are plain JSON and pass through untouched, so no backfill is required.
 */
export const decodeSnapshotField = (value: string): string => {
  if (!value || !isEncodedSnapshotField(value)) return value;

  try {
    const raw = Buffer.from(value.slice(PREFIX.length), "base64");
    return brotliDecompressSync(raw).toString("utf8");
  } catch (error) {
    console.error("Failed to decompress snapshot payload", { error });
    throw new Error("SNAPSHOT_DECODE_FAILED");
  }
};

/** Convenience wrapper for the three payload fields a snapshot carries. */
export const decodeSnapshotPayload = <
  T extends { elements: string; appState: string; files: string },
>(
  snapshot: T,
): T => ({
  ...snapshot,
  elements: decodeSnapshotField(snapshot.elements),
  appState: decodeSnapshotField(snapshot.appState),
  files: decodeSnapshotField(snapshot.files),
});
