import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../../api';
import type { DrawingSortField, SortDirection } from '../../api';
import type { Collection, DrawingSummary } from '../../types';
import { isLatestRequest, mergeUniqueDrawings } from './pagination';

type SelectedCollectionId = string | null | undefined;

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
  const [drawings, setDrawings] = useState<DrawingSummary[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const listRequestVersionRef = useRef(0);

  const hasMore = drawings.length < totalCount;

  const refreshData = useCallback(async () => {
    const requestVersion = ++listRequestVersionRef.current;
    setIsLoading(true);
    try {
      const isSharedView = selectedCollectionId === '__shared__';
      const [drawingsRes, collectionsData] = await Promise.all([
        isSharedView
          ? api.getSharedDrawings({
            search: debouncedSearch || undefined,
            limit: pageSize,
            offset: 0,
            sortField,
            sortDirection,
          })
          : api.getDrawings(debouncedSearch, selectedCollectionId, {
            limit: pageSize,
            offset: 0,
            sortField,
            sortDirection,
          }),
        api.getCollections(),
      ]);
      if (!isLatestRequest(requestVersion, listRequestVersionRef.current)) return;
      setDrawings(drawingsRes.drawings);
      setTotalCount(drawingsRes.totalCount);
      setCollections(collectionsData);
      onRefreshSuccess?.();
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      if (isLatestRequest(requestVersion, listRequestVersionRef.current)) {
        setIsLoading(false);
      }
    }
  }, [
    debouncedSearch,
    selectedCollectionId,
    pageSize,
    sortField,
    sortDirection,
    onRefreshSuccess,
  ]);

  const fetchMore = useCallback(async () => {
    if (isFetchingMore || !hasMore || isLoading) return;
    const requestVersion = listRequestVersionRef.current;
    setIsFetchingMore(true);
    try {
      const isSharedView = selectedCollectionId === '__shared__';
      const drawingsRes = isSharedView
        ? await api.getSharedDrawings({
          search: debouncedSearch || undefined,
          limit: pageSize,
          offset: drawings.length,
          sortField,
          sortDirection,
        })
        : await api.getDrawings(debouncedSearch, selectedCollectionId, {
          limit: pageSize,
          offset: drawings.length,
          sortField,
          sortDirection,
        });
      if (!isLatestRequest(requestVersion, listRequestVersionRef.current)) return;
      setDrawings((prev) => mergeUniqueDrawings(prev, drawingsRes.drawings));
      setTotalCount(drawingsRes.totalCount);
    } catch (err) {
      console.error('Failed to fetch more data:', err);
    } finally {
      setIsFetchingMore(false);
    }
  }, [
    isFetchingMore,
    hasMore,
    isLoading,
    debouncedSearch,
    selectedCollectionId,
    pageSize,
    drawings.length,
    sortField,
    sortDirection,
  ]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  return {
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
    fetchMore,
  };
};
