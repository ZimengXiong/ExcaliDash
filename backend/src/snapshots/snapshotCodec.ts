import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";

const PREFIX = "br1:";
const QUALITY = 5;
// This exceeds the default 50 MiB request-body limit while preventing a
// corrupted or tampered compressed field from expanding without a bound.
const MAX_DECOMPRESSED_FIELD_BYTES = 128 * 1024 * 1024;

export const isEncodedSnapshotField = (value: string): boolean =>
  value.startsWith(PREFIX);

export const encodeSnapshotField = (
  value: string,
  enabled = true,
): string => {
  if (!enabled || !value || isEncodedSnapshotField(value)) return value;

  try {
    const compressed = brotliCompressSync(Buffer.from(value, "utf8"), {
      params: { [constants.BROTLI_PARAM_QUALITY]: QUALITY },
    });
    const encoded = PREFIX + compressed.toString("base64");
    return encoded.length < value.length ? encoded : value;
  } catch (error) {
    console.warn("Snapshot compression failed, storing raw payload", { error });
    return value;
  }
};

export const decodeSnapshotField = (value: string): string => {
  if (!value || !isEncodedSnapshotField(value)) return value;

  try {
    const raw = Buffer.from(value.slice(PREFIX.length), "base64");
    return brotliDecompressSync(raw, {
      maxOutputLength: MAX_DECOMPRESSED_FIELD_BYTES,
    }).toString("utf8");
  } catch (error) {
    console.error("Failed to decompress snapshot payload", { error });
    throw new Error("SNAPSHOT_DECODE_FAILED");
  }
};

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
