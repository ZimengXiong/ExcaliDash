import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSnapshot, serializeTldrawJsonBlob } = vi.hoisted(() => ({
  getSnapshot: vi.fn(() => ({
    document: { store: { "shape:a": {} }, schema: {} },
    session: { version: 1, currentPageId: "page:p" },
  })),
  serializeTldrawJsonBlob: vi.fn(async () => new Blob(["{}"])),
}));

vi.mock("tldraw", () => ({
  getSnapshot,
  serializeTldrawJsonBlob,
  TLDRAW_FILE_EXTENSION: ".tldr",
}));

import {
  buildInitialSnapshot,
  downloadTldrFile,
  generateScenePreview,
  hasStoreContent,
  readSceneSnapshot,
} from "./tldrawSceneIo";

describe("hasStoreContent", () => {
  it("is false for empty / malformed documents", () => {
    expect(hasStoreContent(undefined)).toBe(false);
    expect(hasStoreContent(null)).toBe(false);
    expect(hasStoreContent([])).toBe(false);
    expect(hasStoreContent({})).toBe(false);
    expect(hasStoreContent({ store: {}, schema: {} })).toBe(false);
    expect(hasStoreContent({ store: [] })).toBe(false);
  });

  it("is true when the store carries records", () => {
    expect(hasStoreContent({ store: { "shape:a": {} }, schema: {} })).toBe(
      true,
    );
  });
});

describe("buildInitialSnapshot", () => {
  const doc = { store: { "shape:a": {} }, schema: {} };

  it("returns undefined for an empty document (let tldraw init a blank scene)", () => {
    expect(buildInitialSnapshot({ store: {}, schema: {} }, {})).toBeUndefined();
    expect(buildInitialSnapshot(undefined, undefined)).toBeUndefined();
  });

  it("returns the bare document snapshot when there is no session", () => {
    expect(buildInitialSnapshot(doc, {})).toBe(doc);
    expect(buildInitialSnapshot(doc, undefined)).toBe(doc);
  });

  it("includes the session snapshot when present", () => {
    const session = { version: 1, currentPageId: "page:p" };
    expect(buildInitialSnapshot(doc, session)).toEqual({
      document: doc,
      session,
    });
  });
});

describe("readSceneSnapshot", () => {
  it("splits the editor snapshot into document + session", () => {
    const editor = { store: {} } as never;
    expect(readSceneSnapshot(editor)).toEqual({
      document: { store: { "shape:a": {} }, schema: {} },
      session: { version: 1, currentPageId: "page:p" },
    });
  });
});

describe("generateScenePreview", () => {
  it("returns null for an empty page", async () => {
    const editor = {
      getCurrentPageShapeIds: () => new Set(),
    } as never;
    expect(await generateScenePreview(editor)).toBeNull();
  });

  it("returns the SVG string when export succeeds", async () => {
    const editor = {
      getCurrentPageShapeIds: () => new Set(["shape:a"]),
      getSvgString: vi.fn(async () => ({ svg: "<svg></svg>", width: 1, height: 1 })),
      toImage: vi.fn(),
    } as never;
    expect(await generateScenePreview(editor)).toBe("<svg></svg>");
  });

  it("falls back to a PNG data URL when SVG export throws", async () => {
    const editor = {
      getCurrentPageShapeIds: () => new Set(["shape:a"]),
      getSvgString: vi.fn(async () => {
        throw new Error("no svg");
      }),
      toImage: vi.fn(async () => ({ blob: new Blob(["png"]), width: 1, height: 1 })),
    } as never;
    const result = await generateScenePreview(editor);
    expect(result).toMatch(/^data:/);
  });
});

describe("downloadTldrFile", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("serializes the editor and triggers a .tldr download", async () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const editor = {} as never;

    await downloadTldrFile(editor, "My Drawing!");

    expect(serializeTldrawJsonBlob).toHaveBeenCalledOnce();
    expect(clickSpy).toHaveBeenCalledOnce();
  });
});
