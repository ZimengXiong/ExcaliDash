import { describe, it, expect, vi, beforeEach } from "vitest";

const apiGet = vi.fn();
const apiPost = vi.fn();

vi.mock("../api", () => ({
  api: {
    get: (...args: any[]) => apiGet(...args),
    post: (...args: any[]) => apiPost(...args),
  },
}));

const exportToSvg = vi.fn(async () => ({ outerHTML: "<svg />" }));
vi.mock("@excalidraw/excalidraw", () => ({
  exportToSvg: (...args: any[]) => exportToSvg(...args),
}));

import { importLegacyFiles } from "./importUtils";

vi.mock("jszip", () => {
  class FakeEntry {
    name: string;
    dir: boolean;
    private _content: string;
    constructor(name: string, content: string) {
      this.name = name;
      this.dir = false;
      this._content = content;
    }
    async async(_type: string) {
      return this._content;
    }
  }

  class FakeZip {
    files: Record<string, any>;
    constructor(entries: Array<{ name: string; content: string }>) {
      this.files = {};
      for (const e of entries) {
        this.files[e.name] = new FakeEntry(e.name, e.content);
      }
    }
  }

  return {
    default: {
      loadAsync: async () =>
        new FakeZip([
          {
            name: "Unorganized/hello.excalidraw",
            content: JSON.stringify({ elements: [], appState: {}, files: {} }),
          },
          {
            name: "My Collection/world.excalidraw",
            content: JSON.stringify({ elements: [], appState: {}, files: {} }),
          },
        ]),
    },
  };
});

describe("importLegacyFiles", () => {
  const makeTestFile = (json: unknown, name: string) =>
    ({
      name,
      text: async () => JSON.stringify(json),
    }) as unknown as File;

  const makeTextFile = (text: string, name: string) =>
    ({
      name,
      text: async () => text,
    }) as unknown as File;

  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    exportToSvg.mockClear();
  });

  it("imports a legacy ExcaliDash export JSON ({ drawings: [...] }) and maps collectionName → collectionId", async () => {
    apiGet.mockResolvedValueOnce({
      data: [{ id: "col-existing", name: "Existing Collection" }],
    });

    apiPost.mockImplementation(async (url: string) => {
      if (url === "/collections")
        return { data: { id: "col-new", name: "New Collection" } };
      if (url === "/drawings") return { data: { success: true } };
      throw new Error(`Unexpected POST ${url}`);
    });

    const legacyExport = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      drawings: [
        {
          name: "One",
          elements: [],
          appState: {},
          files: {},
          collectionName: "Existing Collection",
        },
        {
          name: "Two",
          elements: [],
          appState: {},
          files: {},
          collectionName: "New Collection",
        },
        {
          name: "Trash",
          elements: [],
          appState: {},
          files: {},
          collectionId: "trash",
        },
      ],
    };

    const file = makeTestFile(legacyExport, "legacy-export.json");

    const result = await importLegacyFiles([file], null);
    expect(result.failed).toBe(0);
    expect(result.success).toBe(3);

    expect(apiGet).toHaveBeenCalledWith("/collections");

    expect(
      apiPost.mock.calls.filter((c) => c[0] === "/collections"),
    ).toHaveLength(1);
    expect(apiPost.mock.calls.filter((c) => c[0] === "/drawings")).toHaveLength(
      3,
    );

    const drawCalls = apiPost.mock.calls.filter((c) => c[0] === "/drawings");
    expect(drawCalls[0][1].collectionId).toBe("col-existing");
    expect(drawCalls[1][1].collectionId).toBe("col-new");
    expect(drawCalls[2][1].collectionId).toBe("trash");

    expect(exportToSvg).toHaveBeenCalledTimes(3);
  });

  it("honors targetCollectionId override for legacy export JSON", async () => {
    apiPost.mockImplementation(async (url: string) => {
      if (url === "/drawings") return { data: { success: true } };
      throw new Error(`Unexpected POST ${url}`);
    });

    const legacyExport = {
      drawings: [
        {
          name: "One",
          elements: [],
          appState: {},
          files: {},
          collectionName: "A",
        },
        {
          name: "Two",
          elements: [],
          appState: {},
          files: {},
          collectionName: "B",
        },
      ],
    };

    const file = makeTestFile(legacyExport, "legacy-export.json");

    const result = await importLegacyFiles([file], "target-col");
    expect(result.failed).toBe(0);
    expect(result.success).toBe(2);

    expect(apiGet).not.toHaveBeenCalled();
    expect(
      apiPost.mock.calls.filter((c) => c[0] === "/collections"),
    ).toHaveLength(0);

    const drawCalls = apiPost.mock.calls.filter((c) => c[0] === "/drawings");
    expect(drawCalls).toHaveLength(2);
    expect(drawCalls[0][1].collectionId).toBe("target-col");
    expect(drawCalls[1][1].collectionId).toBe("target-col");
  });

  it("imports a single .excalidraw file as a drawing", async () => {
    apiPost.mockImplementation(async (url: string) => {
      if (url === "/drawings") return { data: { success: true } };
      throw new Error(`Unexpected POST ${url}`);
    });

    const excalidraw = {
      type: "excalidraw",
      version: 2,
      source: "test",
      elements: [],
      appState: {},
      files: {},
    };

    const file = makeTextFile(JSON.stringify(excalidraw), "hello.excalidraw");

    const result = await importLegacyFiles([file], null);
    expect(result.failed).toBe(0);
    expect(result.success).toBe(1);

    const drawCalls = apiPost.mock.calls.filter((c) => c[0] === "/drawings");
    expect(drawCalls).toHaveLength(1);
    expect(drawCalls[0][1].name).toBe("hello");
    expect(exportToSvg).toHaveBeenCalledTimes(1);
  });

  it("imports a v0.3.x Export Data (JSON) zip (/export/json) into collections by folder", async () => {
    apiGet.mockResolvedValueOnce({ data: [] });
    apiPost.mockImplementation(async (url: string, body?: any) => {
      if (url === "/collections") {
        return {
          data: { id: "col-created", name: body?.name || "My Collection" },
        };
      }
      if (url === "/drawings") return { data: { success: true } };
      throw new Error(`Unexpected POST ${url}`);
    });

    const zipFile = {
      name: "excalidraw-drawings-2026-02-17.zip",
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as File;

    const result = await importLegacyFiles([zipFile], null);
    expect(result.failed).toBe(0);
    expect(result.success).toBe(2);

    // One collection created for "My Collection"; "Unorganized" stays unorganized (null).
    expect(
      apiPost.mock.calls.filter((c) => c[0] === "/collections"),
    ).toHaveLength(1);

    const drawCalls = apiPost.mock.calls.filter((c) => c[0] === "/drawings");
    expect(drawCalls).toHaveLength(2);
    expect(drawCalls[0][1].name).toBe("hello");
    expect(drawCalls[0][1].collectionId).toBe(null);
    expect(drawCalls[1][1].name).toBe("world");
    expect(drawCalls[1][1].collectionId).toBe("col-created");
  });
});
