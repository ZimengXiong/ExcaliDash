import * as api from "../../api";

type LibraryItem = Record<string, unknown>;

const itemId = (item: LibraryItem): string | null =>
  typeof item.id === "string" ? item.id : null;

const sameItem = (a: LibraryItem, b: LibraryItem) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Apply this tab's library changes (relative to what it last synced) on top
 * of the library currently on the server, matching items by id. Items added
 * or edited locally win, items removed locally are dropped, and everything
 * else (including items other tabs added meanwhile) is kept from the server.
 */
export const rebaseLibrary = (
  base: readonly LibraryItem[],
  local: readonly LibraryItem[],
  server: readonly LibraryItem[],
): LibraryItem[] => {
  const baseById = new Map<string, LibraryItem>();
  for (const item of base) {
    const id = itemId(item);
    if (id) baseById.set(id, item);
  }
  const localIds = new Set<string>();
  const changed = new Map<string, LibraryItem>();
  for (const item of local) {
    const id = itemId(item);
    if (!id) continue;
    localIds.add(id);
    const before = baseById.get(id);
    if (!before || !sameItem(before, item)) changed.set(id, item);
  }
  const removed = new Set<string>();
  for (const id of baseById.keys()) {
    if (!localIds.has(id)) removed.add(id);
  }

  const serverIds = new Set<string>();
  const kept: LibraryItem[] = [];
  for (const item of server) {
    const id = itemId(item);
    if (id) {
      serverIds.add(id);
      if (removed.has(id)) continue;
      kept.push(changed.get(id) ?? item);
    } else {
      kept.push(item);
    }
  }
  const added = [...changed].filter(([id]) => !serverIds.has(id));
  return [...added.map(([, item]) => item), ...kept];
};

// Library state is per browser tab: the items this tab last synced with the
// server, and a queue so concurrent saves never interleave.
let lastSynced: LibraryItem[] = [];
let queue: Promise<unknown> = Promise.resolve();

const enqueue = <T>(task: () => Promise<T> | T): Promise<T> => {
  const run = queue.then(task);
  queue = run.catch(() => undefined);
  return run;
};

/** Record the library this tab just loaded; later saves diff against it. */
export const resetLibrarySync = (items: readonly LibraryItem[]) =>
  enqueue(() => {
    lastSynced = [...items];
  });

/**
 * Persist this tab's library without clobbering other tabs: nothing is sent
 * when the tab has no changes, otherwise its changes are rebased onto the
 * current server library before the PUT.
 */
export const saveLibraryItems = (items: readonly LibraryItem[]) =>
  enqueue(async () => {
    const local = [...items];
    const base = lastSynced;
    const unchanged =
      local.length === base.length &&
      local.every((item, index) => sameItem(item, base[index]));
    if (unchanged) return;
    const server = await api.getLibrary();
    const merged = rebaseLibrary(base, local, server);
    if (
      merged.length !== server.length ||
      !merged.every((item, index) => sameItem(item, server[index]))
    ) {
      await api.updateLibrary(merged);
    }
    lastSynced = local;
  });
