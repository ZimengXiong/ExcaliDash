import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { describe, expect, it } from "vitest";
import {
  buildRemoteSceneUpdate,
  getPersistedAppState,
  hasRenderableElements,
  isSuspiciousEmptySnapshot,
  isStaleEmptySnapshot,
  isStaleNonRenderableSnapshot,
} from "./shared";

describe("editor/shared scene guards", () => {
  it("detects renderable elements", () => {
    expect(hasRenderableElements([{ id: "a", isDeleted: false }])).toBe(true);
    expect(
      hasRenderableElements([
        { id: "a", isDeleted: true },
        { id: "b", isDeleted: true },
      ])
    ).toBe(false);
  });

  it("flags empty snapshot after a previously non-empty persisted scene", () => {
    const previous = [{ id: "a", isDeleted: false }];
    expect(isSuspiciousEmptySnapshot(previous, [])).toBe(true);
  });

  it("does not flag empty snapshot for already-empty drawings", () => {
    expect(isSuspiciousEmptySnapshot([], [])).toBe(false);
  });

  it("does not flag non-empty snapshots", () => {
    const previous = [{ id: "a", isDeleted: false }];
    const next = [{ id: "a", isDeleted: true }];
    expect(isSuspiciousEmptySnapshot(previous, next)).toBe(false);
  });

  it("flags stale empty snapshot when latest scene is non-empty", () => {
    const latest = [{ id: "a", version: 2, versionNonce: 2, isDeleted: false }];
    expect(isStaleEmptySnapshot(latest, [])).toBe(true);
  });

  it("does not flag empty snapshot when latest scene is already empty", () => {
    expect(isStaleEmptySnapshot([], [])).toBe(false);
  });

  it("does not flag identical empty snapshots", () => {
    const latest = [];
    const candidate = [];
    expect(isStaleEmptySnapshot(latest, candidate)).toBe(false);
  });

  it("flags stale non-renderable snapshot when latest scene has renderable elements", () => {
    const latest = [{ id: "a", version: 2, versionNonce: 2, isDeleted: false }];
    const candidate = [{ id: "a", version: 1, versionNonce: 1, isDeleted: true }];
    expect(isStaleNonRenderableSnapshot(latest, candidate)).toBe(true);
  });

  it("does not flag non-renderable snapshot when latest scene is already non-renderable", () => {
    const latest = [{ id: "a", version: 2, versionNonce: 2, isDeleted: true }];
    const candidate = [{ id: "a", version: 1, versionNonce: 1, isDeleted: true }];
    expect(isStaleNonRenderableSnapshot(latest, candidate)).toBe(false);
  });

  it("marks collaborator-only updates as non-history scene changes", () => {
    const collaborators = new Map([
      ["user-2", { id: "user-2", username: "B" }],
    ]);

    const result = buildRemoteSceneUpdate({ collaborators });

    expect(result.sceneUpdate).toEqual({
      collaborators,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    expect(result.mergedElements).toBeNull();
    expect(result.shouldUpdateFiles).toBe(false);
  });

  it("marks remote element merges as non-history scene changes", () => {
    const localElements = [
      { id: "local", version: 1, versionNonce: 1, updated: 1, x: 0, y: 0, isDeleted: false },
    ];
    const pendingElements = [
      { id: "remote", version: 2, versionNonce: 2, updated: 2, x: 10, y: 15, isDeleted: false },
    ];

    const result = buildRemoteSceneUpdate({
      localElements,
      pendingElements,
      lastSyncedFiles: {},
      incomingFiles: {},
    });

    expect(result.sceneUpdate).toEqual({
      elements: [
        localElements[0],
        pendingElements[0],
      ],
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    expect(result.mergedElements).toEqual([
      localElements[0],
      pendingElements[0],
    ]);
  });

  it("marks remote file-only updates as non-history scene changes", () => {
    const incomingFiles = {
      "file-1": {
        id: "file-1",
        mimeType: "image/png",
        dataURL: "data:image/png;base64,abc123",
      },
    };

    const result = buildRemoteSceneUpdate({
      lastSyncedFiles: {},
      incomingFiles,
    });

    expect(result.sceneUpdate).toEqual({
      files: incomingFiles,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    expect(result.mergedElements).toBeNull();
    expect(result.nextFiles).toEqual(incomingFiles);
    expect(result.shouldUpdateFiles).toBe(true);
  });

  it("preserves remote element order while keeping the update out of local history", () => {
    const localElements = [
      { id: "a", version: 1, versionNonce: 1, updated: 1, isDeleted: false },
      { id: "b", version: 1, versionNonce: 1, updated: 1, isDeleted: false },
    ];

    const result = buildRemoteSceneUpdate({
      localElements,
      pendingElements: [],
      elementOrder: ["b", "a"],
    });

    expect(result.sceneUpdate).toEqual({
      elements: [
        localElements[1],
        localElements[0],
      ],
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    expect(result.mergedElements).toEqual([
      localElements[1],
      localElements[0],
    ]);
  });

  it("keeps only durable appState fields for persisted drawings", () => {
    expect(
      getPersistedAppState({
        viewBackgroundColor: "#123456",
        gridSize: 24,
        cursorButton: "down",
        activeTool: { type: "hand", locked: false, lastActiveTool: null },
        selectedElementIds: { a: true },
        selectedGroupIds: { g1: true },
        editingElement: { id: "editing" },
        draggingElement: { id: "dragging" },
        scrollX: 120,
        scrollY: 240,
      })
    ).toEqual({
      viewBackgroundColor: "#123456",
      gridSize: 24,
    });
  });

  it("falls back to safe defaults when persisted appState is missing or invalid", () => {
    expect(getPersistedAppState(undefined)).toEqual({
      viewBackgroundColor: "#ffffff",
      gridSize: null,
    });

    expect(getPersistedAppState(null)).toEqual({
      viewBackgroundColor: "#ffffff",
      gridSize: null,
    });
  });
});
