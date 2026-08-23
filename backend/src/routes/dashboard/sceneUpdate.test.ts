import { describe, expect, it, vi } from "vitest";
import { applySceneUpdateTx, isVersionConflict } from "./sceneUpdate";
import {
  decodeSnapshotField,
  isEncodedSnapshotField,
} from "../../snapshots/snapshotCodec";

const drawing = (version: number) => ({
  id: "drawing-1",
  version,
  elements: "[]",
  appState: "{}",
  files: "{}",
});

const buildPrisma = (updateCounts: number[]) => {
  let attempt = 0;
  const updateMany = vi.fn(async () => ({
    count: updateCounts[attempt++] ?? 0,
  }));
  const snapshotCreate = vi.fn(async () => ({}));
  const tx = {
    drawing: {
      findUnique: vi.fn(async () => drawing(7 + attempt)),
      updateMany,
      findFirst: vi.fn(async () => drawing(8 + attempt)),
    },
    drawingSnapshot: { create: snapshotCreate },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  return { prisma, snapshotCreate, updateMany };
};

describe("applySceneUpdateTx", () => {
  it("compresses the snapshot without changing its contents", async () => {
    const largeElements = JSON.stringify(
      Array.from({ length: 300 }, (_, index) => ({
        id: `element-${index}`,
        type: "rectangle",
        x: index,
        y: index,
      })),
    );
    const { snapshotCreate } = buildPrisma([1]);
    const fakePrisma: any = {
      $transaction: async (callback: (client: any) => unknown) =>
        callback({
          drawing: {
            findUnique: async () => ({ ...drawing(7), elements: largeElements }),
            updateMany: async () => ({ count: 1 }),
            findFirst: async () => drawing(8),
          },
          drawingSnapshot: { create: snapshotCreate },
        }),
    };

    await applySceneUpdateTx({
      prisma: fakePrisma,
      drawingId: "drawing-1",
      parseJsonField: (raw, fallback) =>
        raw ? (JSON.parse(raw) as typeof fallback) : fallback,
      versionGuard: 7,
      snapshotCompressionEnabled: true,
      mutate: () => ({ data: { elements: largeElements } }),
    });

    const stored = snapshotCreate.mock.calls[0][0].data.elements;
    expect(isEncodedSnapshotField(stored)).toBe(true);
    expect(decodeSnapshotField(stored)).toBe(largeElements);
  });

  it("retries a version race for clients that omit an explicit version", async () => {
    const { prisma, updateMany } = buildPrisma([0, 1]);

    const result = await applySceneUpdateTx({
      prisma: prisma as any,
      drawingId: "drawing-1",
      parseJsonField: (raw, fallback) =>
        raw ? (JSON.parse(raw) as typeof fallback) : fallback,
      versionGuard: "optimistic",
      maxRetries: 2,
      mutate: () => ({ data: { elements: "[]" } }),
    });

    expect(result.drawing.version).toBe(10);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(updateMany.mock.calls[0][0].where).toEqual({
      id: "drawing-1",
      version: 7,
    });
    expect(updateMany.mock.calls[1][0].where).toEqual({
      id: "drawing-1",
      version: 8,
    });
  });

  it("does not retry a conflict for a client-supplied version", async () => {
    const { prisma } = buildPrisma([0, 1]);

    await expect(
      applySceneUpdateTx({
        prisma: prisma as any,
        drawingId: "drawing-1",
        parseJsonField: (raw, fallback) =>
          raw ? (JSON.parse(raw) as typeof fallback) : fallback,
        versionGuard: 7,
        maxRetries: 2,
        mutate: () => ({ data: { elements: "[]" } }),
      }),
    ).rejects.toSatisfy(isVersionConflict);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
