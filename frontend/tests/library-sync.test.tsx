import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Item = { id: string; name?: string };
let server: Item[] = [];
const getLibrary = vi.fn(async () => structuredClone(server));
const updateLibrary = vi.fn(async (items: Item[]) => {
  server = structuredClone(items);
  return structuredClone(server);
});
vi.mock("../src/api", () => ({
  getLibrary: () => getLibrary(),
  updateLibrary: (items: Item[]) => updateLibrary(items),
}));
vi.mock("sonner", () => ({
  toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Each browser tab has its own module instance (and so its own library state).
const openTab = async () => {
  vi.resetModules();
  return await import("../src/pages/editor/librarySync");
};
const ids = (items: Item[]) => items.map((item) => item.id);

beforeEach(() => {
  server = [];
  getLibrary.mockClear();
  updateLibrary.mockClear();
});

describe("library sync across tabs", () => {
  it("does not echo a PUT when the library is unchanged since load", async () => {
    server = [{ id: "a" }, { id: "b" }];
    const tab = await openTab();
    await tab.resetLibrarySync(await getLibrary());
    getLibrary.mockClear();
    await tab.saveLibraryItems([{ id: "a" }, { id: "b" }]);
    expect(getLibrary).not.toHaveBeenCalled();
    expect(updateLibrary).not.toHaveBeenCalled();
  });

  it("keeps newer items from the server when a stale tab saves", async () => {
    const stale = await openTab();
    await stale.resetLibrarySync([]);
    const fresh = await openTab();
    await fresh.resetLibrarySync([]);

    await fresh.saveLibraryItems([{ id: "x" }, { id: "y" }, { id: "z" }]);
    expect(ids(server)).toEqual(["x", "y", "z"]);

    await stale.saveLibraryItems([{ id: "mine" }]);
    expect(ids(server).sort()).toEqual(["mine", "x", "y", "z"]);

    // A stale empty array never wipes the library.
    await stale.saveLibraryItems([{ id: "mine" }]);
    await stale.saveLibraryItems([]);
    expect(ids(server).sort()).toEqual(["x", "y", "z"]);
  });

  it("propagates deletions made in another tab", async () => {
    server = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const tabA = await openTab();
    await tabA.resetLibrarySync(await getLibrary());
    const tabB = await openTab();
    await tabB.resetLibrarySync(await getLibrary());

    await tabA.saveLibraryItems([{ id: "a" }, { id: "c" }]);
    expect(ids(server)).toEqual(["a", "c"]);

    await tabB.saveLibraryItems([
      { id: "a" },
      { id: "b" },
      { id: "c" },
      { id: "d" },
    ]);
    expect(ids(server)).toEqual(["d", "a", "c"]);
  });

  it("serializes overlapping saves", async () => {
    const tab = await openTab();
    await tab.resetLibrarySync([]);
    const order: string[] = [];
    updateLibrary.mockImplementationOnce(async (items) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push("first");
      server = structuredClone(items);
      return items;
    });
    const first = tab.saveLibraryItems([{ id: "a" }]);
    const second = tab.saveLibraryItems([{ id: "a" }, { id: "b" }]).then(() => {
      order.push("second");
    });
    await Promise.all([first, second]);
    expect(order).toEqual(["first", "second"]);
    expect(ids(server).sort()).toEqual(["a", "b"]);
  });

  it("retries unsynced changes after a failed save", async () => {
    const tab = await openTab();
    await tab.resetLibrarySync([]);
    updateLibrary.mockRejectedValueOnce(new Error("offline"));
    await expect(tab.saveLibraryItems([{ id: "a" }])).rejects.toThrow();
    await tab.saveLibraryItems([{ id: "a" }]);
    expect(ids(server)).toEqual(["a"]);
  });
});

describe("library import from url", () => {
  const originalWindow = (globalThis as any).window;
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    (globalThis as any).window = originalWindow;
    globalThis.fetch = originalFetch;
  });

  it("persists the merged items returned by updateLibrary", async () => {
    server = [{ id: "existing" }];
    (globalThis as any).window = {
      location: {
        hash: "#addLibrary=/lib.excalidrawlib",
        href: "http://localhost/editor/1",
        origin: "http://localhost",
        pathname: "/editor/1",
        search: "",
      },
      history: { replaceState: vi.fn() },
      confirm: vi.fn(),
    };
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      blob: async () => ({ size: 10 }),
    })) as any;
    const { useLibraryImportFromUrl } =
      await import("../src/pages/editor/useLibraryImportFromUrl");
    const sync = await import("../src/pages/editor/librarySync");
    await sync.resetLibrarySync([{ id: "existing" }]);
    const merged = [{ id: "imported" }, { id: "existing" }];
    const excalidrawAPIRef = {
      current: {
        updateLibrary: vi.fn(async () => merged),
        getAppState: () => ({}),
      },
    };
    const Probe = () => {
      useLibraryImportFromUrl({ excalidrawAPIRef, isReady: true, user: {} });
      return null;
    };
    await act(async () => {
      create(<Probe />);
    });
    await vi.waitFor(() => expect(updateLibrary).toHaveBeenCalled());
    expect(ids(server).sort()).toEqual(["existing", "imported"]);
  });
});
