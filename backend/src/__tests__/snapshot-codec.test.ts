import { describe, expect, it } from "vitest";
import {
  decodeSnapshotField,
  decodeSnapshotPayload,
  encodeSnapshotField,
  isEncodedSnapshotField,
} from "../snapshots/snapshotCodec";

const buildScene = (count: number): string =>
  JSON.stringify(
    Array.from({ length: count }, (_, index) => ({
      id: `element-${index}`,
      type: "rectangle",
      x: index * 10,
      y: index * 4,
      width: 160,
      height: 80,
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
      groupIds: [],
      isDeleted: false,
    })),
  );

describe("snapshot codec", () => {
  it("round-trips and substantially shrinks a realistic scene", () => {
    const scene = buildScene(500);
    const encoded = encodeSnapshotField(scene);

    expect(isEncodedSnapshotField(encoded)).toBe(true);
    expect(encoded.length).toBeLessThan(scene.length * 0.25);
    expect(decodeSnapshotField(encoded)).toBe(scene);
  });

  it("passes legacy, tiny, and disabled payloads through unchanged", () => {
    const legacy = JSON.stringify([{ id: "element-1" }]);
    const scene = buildScene(50);

    expect(decodeSnapshotField(legacy)).toBe(legacy);
    expect(encodeSnapshotField("[]")).toBe("[]");
    expect(encodeSnapshotField(scene, false)).toBe(scene);
  });

  it("does not encode an encoded payload twice", () => {
    const encoded = encodeSnapshotField(buildScene(50));
    expect(encodeSnapshotField(encoded)).toBe(encoded);
  });

  it("round-trips non-ASCII text", () => {
    const scene = JSON.stringify([
      { id: "element-1", type: "text", text: "Kundenanfragen — größer, ähnlich, ß" },
    ]);
    expect(decodeSnapshotField(encodeSnapshotField(scene))).toBe(scene);
  });

  it("rejects corrupted encoded payloads", () => {
    expect(() => decodeSnapshotField("br1:not-valid-brotli")).toThrowError(
      "SNAPSHOT_DECODE_FAILED",
    );
  });

  it("decodes all payload fields while preserving row metadata", () => {
    const payload = {
      id: "snapshot-1",
      elements: encodeSnapshotField(buildScene(20)),
      appState: encodeSnapshotField(JSON.stringify({ zoom: 1 })),
      files: encodeSnapshotField("{}"),
    };

    const decoded = decodeSnapshotPayload(payload);
    expect(decoded.id).toBe("snapshot-1");
    expect(JSON.parse(decoded.elements)).toHaveLength(20);
    expect(decoded.appState).toBe('{"zoom":1}');
    expect(decoded.files).toBe("{}");
  });
});
