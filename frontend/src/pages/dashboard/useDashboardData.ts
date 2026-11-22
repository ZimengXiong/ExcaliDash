import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import * as api from "../../api";
import type { DrawingSortField, SortDirection } from "../../api";
import type { Collection, DrawingSummary } from "../../types";
import { mergeUniqueDrawings } from "./pagination";
import { invalidateDrawingPreview } from "../../components/drawing-card/previewCache";
import { invalidatePrefetchedDrawing } from "../../utils/drawingPrefetch";

type SelectedCollectionId = string | null | undefined;

type CachedListSnapshot = {
  collectionId: SelectedCollectionId;
  drawings: DrawingSummary[];
  totalCount: number;
};

type ListParams = {
  selectedCollectionId: SelectedCollectionId;
  search: string;
  sortField: DrawingSortField;
  sortDirection: SortDirection;
};

const MAX_CACHED_LISTS = 24;
const dashboardListCache = new Map<string, CachedListSnapshot>();
let cachedCollections: Collection[] = [];
let sessionGeneration = 0;
let listCacheRevision = 0;
let drawingMutationRevision = 0;
const pendingDrawingMutations = new Set<Promise<unknown>>();

const dashboardListCacheKey = ({
  selectedCollectionId,
  search,
  sortField,
  sortDirection,
}: ListParams): string =>
  JSON.stringify([
    selectedCollectionId,
    selectedCollectionId === undefined,
    search,
    sortField,
    sortDirection,
  ]);

const writeDashboardListCache = (
  key: string,
  snapshot: CachedListSnapshot,
): void => {
  dashboardListCache.delete(key);
  dashboardListCache.set(key, snapshot);
  if (dashboardListCache.size > MAX_CACHED_LISTS) {
    const oldestKey = dashboardListCache.keys().next().value;
    if (oldestKey !== undefined) dashboardListCache.delete(oldestKey);
  }
};

const invalidateDashboardLists = () => {
  listCacheRevision++;
  dashboardListCache.clear();
};

export const clearDashboardDataCache = (): void => {
  sessionGeneration++;
  invalidateDashboardLists();
  cachedCollections = [];
  pendingDrawingMutations.clear();
};

export const mutateDashboardDrawings = async <T>(
  mutate: () => Promise<T>,
  { changesExisting = true } = {},
): Promise<T> => {
  const session = sessionGeneration;
  invalidateDashboardLists();
  if (changesExisting) drawingMutationRevision++;
  const request = mutate();
  if (changesExisting) pendingDrawingMutations.add(request);
  try {
    return await request;
  } finally {
    pendingDrawingMutations.delete(request);
    if (session === sessionGeneration) invalidateDashboardLists();
  }
};

const isAccessDenied = (error: unknown) =>
  api.isAxiosError(error) &&
  [401, 403, 404].includes(error.response?.status ?? 0);

const evictDeniedDrawings = (
  drawings: DrawingSummary[],
  deniesList: (snapshot: CachedListSnapshot) => boolean,
) => {
  const ids = new Set(drawings.map((drawing) => drawing.id));
  for (const [key, snapshot] of dashboardListCache) {
    if (!deniesList(snapshot)) continue;
    dashboardListCache.delete(key);
    for (const drawing of snapshot.drawings) ids.add(drawing.id);
  }
  listCacheRevision++;
  for (const [key, snapshot] of dashboardListCache) {
    if (snapshot.drawings.some((drawing) => ids.has(drawing.id))) {
      dashboardListCache.delete(key);
    }
  }
  for (const id of ids) {
    invalidateDrawingPreview(id, true);
    invalidatePrefetchedDrawing(id);
  }
  return ids;
};

export const matchesDrawingSearch = (
  drawing: DrawingSummary,
  search: string,
): boolean => {
  const term = search.trim().toLowerCase();
  return !term || drawing.name.toLowerCase().includes(term);
};

const timeOf = (value: unknown) => new Date(value as string | number).getTime();

export const sortDrawings = (
  drawings: DrawingSummary[],
  field: DrawingSortField,
  direction: SortDirection,
): DrawingSummary[] => {
  const sign = direction === "asc" ? 1 : -1;
  return [...drawings].sort(
    (a, b) =>
      sign *
      (field === "name"
        ? a.name.localeCompare(b.name)
        : timeOf(a[field]) - timeOf(b[field])),
  );
};

/**
 * Best local guess at a list that has not been fetched yet, shown in the same
 * frame as the click while the server answers. Null when nothing useful is
 * known (shared/trash views, collections shared with the user).
 */
const derivePlaceholder = (
  current: DrawingSummary[],
  previous: ListParams,
  next: ListParams,
  collections: Collection[],
): DrawingSummary[] | null => {
  const target = next.selectedCollectionId;
  let source: DrawingSummary[] | undefined;
  if (target === previous.selectedCollectionId) {
    source = current;
  } else if (
    target === null ||
    collections.some((c) => c.id === target && c.isOwner !== false)
  ) {
    // The user's own collections are a subset of All Drawings.
    const all =
      previous.selectedCollectionId === undefined
        ? current
        : dashboardListCache.get(
            dashboardListCacheKey({ ...next, selectedCollectionId: undefined }),
          )?.drawings;
    source = all?.filter((drawing) => drawing.collectionId === target);
  } else if (target === undefined) {
    source = dashboardListCache.get(
      dashboardListCacheKey({ ...next, selectedCollectionId: undefined }),
    )?.drawings;
  }
  if (!source) return null;
  return sortDrawings(
    source.filter((drawing) => matchesDrawingSearch(drawing, next.search)),
    next.sortField,
    next.sortDirection,
  );
};

const sameCollections = (a: Collection[], b: Collection[]) =>
  a === b || JSON.stringify(a) === JSON.stringify(b);

type UseDashboardDataOptions = {
  debouncedSearch: string;
  selectedCollectionId: SelectedCollectionId;
  sortField: DrawingSortField;
  sortDirection: SortDirection;
  pageSize: number;
  onRefreshSuccess?: () => void;
};

export const useDashboardData = ({
  debouncedSearch,
  selectedCollectionId,
  sortField,
  sortDirection,
  pageSize,
  onRefreshSuccess,
}: UseDashboardDataOptions) => {
  const params: ListParams = {
    selectedCollectionId,
    search: debouncedSearch,
    sortField,
    sortDirection,
  };
  const listKey = dashboardListCacheKey(params);
  const initialCached = dashboardListCache.get(listKey);
  const [drawings, setDrawings] = useState<DrawingSummary[]>(
    () => initialCached?.drawings ?? [],
  );
  const [collections, setCollections] = useState<Collection[]>(
    () => cachedCollections,
  );
  const [totalCount, setTotalCount] = useState(
    () => initialCached?.totalCount ?? 0,
  );
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [isLoading, setIsLoading] = useState(() => !initialCached);
  const [shownList, setShownList] = useState({ key: listKey, params });
  const listRequestVersion = useRef(0);
  const collectionsRequestVersion = useRef(0);
  const nextOffset = useRef(initialCached?.drawings.length ?? 0);
  const pageRequestPending = useRef(false);
  const [session] = useState(() => sessionGeneration);
  const shownDrawings = useRef(drawings);
  const activeList = useRef<typeof shownList | null>(null);

  useLayoutEffect(() => {
    activeList.current = shownList;
    nextOffset.current =
      dashboardListCache.get(shownList.key)?.drawings.length ?? 0;
    pageRequestPending.current = false;
    return () => {
      activeList.current = null;
    };
  }, [shownList]);

  useLayoutEffect(() => {
    shownDrawings.current = drawings;
  }, [drawings]);

  // Switch lists in the same render as the sidebar, sort or search change.
  if (shownList.key !== listKey) {
    const cached = dashboardListCache.get(listKey);
    const placeholder = cached
      ? null
      : derivePlaceholder(drawings, shownList.params, params, collections);
    setShownList({ key: listKey, params });
    setDrawings(cached?.drawings ?? placeholder ?? []);
    setTotalCount(cached?.totalCount ?? placeholder?.length ?? 0);
    setIsFetchingMore(false);
    setIsLoading(!cached);
  }

  const hasMore = drawings.length < totalCount;

  const clearShownDrawings = useCallback(() => {
    listRequestVersion.current++;
    shownDrawings.current = [];
    nextOffset.current = 0;
    pageRequestPending.current = false;
    setDrawings([]);
    setTotalCount(0);
    setIsFetchingMore(false);
    setIsLoading(false);
    onRefreshSuccess?.();
  }, [onRefreshSuccess]);

  const loadCollections = useCallback(async () => {
    if (session !== sessionGeneration || !activeList.current) return;
    const version = ++collectionsRequestVersion.current;
    const isCurrent = () =>
      session === sessionGeneration &&
      activeList.current &&
      version === collectionsRequestVersion.current;
    try {
      const next = await api.getCollections();
      if (!isCurrent()) return;
      cachedCollections = next;
      setCollections((current) =>
        sameCollections(current, next) ? current : next,
      );
    } catch (err) {
      if (!isCurrent()) return;
      if (isAccessDenied(err)) {
        cachedCollections = [];
        setCollections([]);
        evictDeniedDrawings(shownDrawings.current, () => true);
        clearShownDrawings();
      }
      console.error("Failed to fetch collections:", err);
    }
  }, [clearShownDrawings, session]);

  const loadList = useCallback(
    async (append: boolean) => {
      if (session !== sessionGeneration || activeList.current !== shownList)
        return;
      if (append && pageRequestPending.current) return;
      const version = ++listRequestVersion.current;
      const isCurrent = () =>
        session === sessionGeneration &&
        activeList.current === shownList &&
        version === listRequestVersion.current;

      pageRequestPending.current = true;
      setIsFetchingMore(append);
      if (!append) setIsLoading(true);
      const requestDrawings = shownDrawings.current;
      try {
        // A switched view should fetch after any in-flight move, rename or delete.
        while (pendingDrawingMutations.size > 0) {
          await Promise.allSettled(pendingDrawingMutations);
          if (!isCurrent()) return;
        }
        const cacheRevision = listCacheRevision;
        const mutationRevision = drawingMutationRevision;
        const offset = append ? nextOffset.current : 0;
        const options = { limit: pageSize, offset, sortField, sortDirection };
        const result = await (selectedCollectionId === "shared"
          ? api.getSharedDrawings(debouncedSearch, options)
          : api.getDrawings(debouncedSearch, selectedCollectionId, options));
        if (!isCurrent() || mutationRevision !== drawingMutationRevision)
          return;
        const next = append
          ? mergeUniqueDrawings(shownDrawings.current, result.drawings)
          : result.drawings;
        if (cacheRevision === listCacheRevision) {
          writeDashboardListCache(listKey, {
            drawings: next,
            totalCount: result.totalCount,
            collectionId: selectedCollectionId,
          });
        }
        shownDrawings.current = next;
        setDrawings(next);
        setTotalCount(result.totalCount);
        nextOffset.current = offset + result.drawings.length;
        if (!append) onRefreshSuccess?.();
      } catch (err) {
        if (session !== sessionGeneration) return;
        const current = isCurrent();
        const otherCollection =
          activeList.current?.params.selectedCollectionId !==
          selectedCollectionId;
        if (
          isAccessDenied(err) &&
          (current || otherCollection || !activeList.current)
        ) {
          const evictedIds = evictDeniedDrawings(
            current ? shownDrawings.current : requestDrawings,
            (snapshot) => snapshot.collectionId === selectedCollectionId,
          );
          if (current) {
            clearShownDrawings();
          } else if (activeList.current) {
            const visible = shownDrawings.current;
            const remaining = visible.filter(
              (drawing) => !evictedIds.has(drawing.id),
            );
            if (remaining.length < visible.length) {
              shownDrawings.current = remaining;
              setDrawings(remaining);
              setTotalCount(
                (count) => count - (visible.length - remaining.length),
              );
            }
          }
        }
        if (current) console.error("Failed to fetch drawings:", err);
      } finally {
        if (isCurrent()) {
          pageRequestPending.current = false;
          setIsFetchingMore(false);
          setIsLoading(false);
        }
      }
    },
    [
      shownList,
      session,
      listKey,
      debouncedSearch,
      selectedCollectionId,
      pageSize,
      sortField,
      sortDirection,
      onRefreshSuccess,
      clearShownDrawings,
    ],
  );

  const refreshDrawings = useCallback(() => loadList(false), [loadList]);
  const currentLoader = useRef(refreshDrawings);
  useLayoutEffect(() => {
    currentLoader.current = refreshDrawings;
  }, [refreshDrawings]);

  const refreshCurrentDrawings = useCallback(() => currentLoader.current(), []);
  const refreshData = useCallback(async () => {
    await Promise.all([refreshCurrentDrawings(), loadCollections()]);
  }, [loadCollections, refreshCurrentDrawings]);

  const fetchMore = useCallback(async () => {
    if (!hasMore || isLoading || pendingDrawingMutations.size > 0) return;
    await loadList(true);
  }, [hasMore, isLoading, loadList]);

  useEffect(() => {
    void loadCollections();
  }, [loadCollections]);

  useEffect(() => {
    void refreshDrawings();
  }, [refreshDrawings]);

  return {
    listKey,
    drawings,
    setDrawings,
    collections,
    setCollections,
    totalCount,
    setTotalCount,
    isFetchingMore,
    isLoading,
    hasMore,
    refreshData,
    refreshDrawings,
    refreshCurrentDrawings,
    fetchMore,
  };
};
