import { describe, expect, it } from "vitest";
import {
  decodeSnapshotField,
  decodeSnapshotPayload,
  encodeSnapshotField,
  isEncodedSnapshotField,
} from "../snapshots/snapshotCodec";

const buildScene = (count: number): string =>
  JSON.stringify(
    Array.from({ length: count }, (_, i) => ({
      id: `el-${i}`,
      type: "rectangle",
      x: i * 10,
      y: i * 4,
      width: 160,
      height: 80,
      angle: 0,
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 2,
      roughness: 1,
      opacity: 100,
      groupIds: [],
      isDeleted: false,
    })),
  );

describe("snapshot codec", () => {
  it("round-trips a scene payload", () => {
    const scene = buildScene(200);
    const encoded = encodeSnapshotField(scene);

    expect(isEncodedSnapshotField(encoded)).toBe(true);
    expect(decodeSnapshotField(encoded)).toBe(scene);
    expect(JSON.parse(decodeSnapshotField(encoded))).toHaveLength(200);
  });

  it("shrinks realistic scenes substantially", () => {
    const scene = buildScene(500);
    const encoded = encodeSnapshotField(scene);

    expect(encoded.length).toBeLessThan(scene.length * 0.25);
  });

  it("passes uncompressed legacy payloads through unchanged", () => {
    const legacy = JSON.stringify([{ id: "el-1", type: "rectangle" }]);

    expect(isEncodedSnapshotField(legacy)).toBe(false);
    expect(decodeSnapshotField(legacy)).toBe(legacy);
  });

  it("keeps the plain payload when encoding would not pay off", () => {
    const tiny = "[]";

    expect(encodeSnapshotField(tiny)).toBe(tiny);
  });

  it("stores the raw payload when disabled", () => {
    const scene = buildScene(50);

    expect(encodeSnapshotField(scene, false)).toBe(scene);
  });

  it("never wraps an already encoded payload twice", () => {
    const encoded = encodeSnapshotField(buildScene(50));

    expect(encodeSnapshotField(encoded)).toBe(encoded);
  });

  it("handles empty values on both paths", () => {
    expect(encodeSnapshotField("")).toBe("");
    expect(decodeSnapshotField("")).toBe("");
  });

  it("survives non-ASCII content", () => {
    const scene = JSON.stringify([
      { id: "el-1", type: "text", text: "Kundenanfragen — größer, ähnlich, ß" },
    ]);

    expect(decodeSnapshotField(encodeSnapshotField(scene))).toBe(scene);
  });

  it("throws a named error on corrupted payloads", () => {
    expect(() => decodeSnapshotField("br1:not-valid-brotli")).toThrowError(
      "SNAPSHOT_DECODE_FAILED",
    );
  });

  it("decodes all three payload fields of a snapshot row", () => {
    const elements = buildScene(20);
    const appState = JSON.stringify({ viewBackgroundColor: "#ffffff" });
    const files = "{}";

    const decoded = decodeSnapshotPayload({
      id: "snap-1",
      elements: encodeSnapshotField(elements),
      appState: encodeSnapshotField(appState),
      files: encodeSnapshotField(files),
    });

    expect(decoded.id).toBe("snap-1");
    expect(decoded.elements).toBe(elements);
    expect(decoded.appState).toBe(appState);
    expect(decoded.files).toBe(files);
  });
});
