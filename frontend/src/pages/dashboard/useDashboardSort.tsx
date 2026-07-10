import React, { useEffect, useRef, useState } from "react";
import { Calendar, Clock, FileText } from "lucide-react";
import * as api from "../../api";
import type { DrawingSortField, SortDirection } from "../../api";

const DASHBOARD_SORT_STORAGE_KEY = "excalidash-dashboard-sort";

export const isSortField = (value: unknown): value is DrawingSortField =>
  value === "name" || value === "createdAt" || value === "updatedAt";

export const isSortDirection = (value: unknown): value is SortDirection =>
  value === "asc" || value === "desc";

const readStoredSortConfig = (): {
  field: DrawingSortField;
  direction: SortDirection;
} => {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return { field: "updatedAt", direction: "desc" };
    }
    const raw = window.localStorage.getItem(DASHBOARD_SORT_STORAGE_KEY);
    if (!raw) return { field: "updatedAt", direction: "desc" };
    const parsed = JSON.parse(raw) as { field?: unknown; direction?: unknown };
    if (!isSortField(parsed.field) || !isSortDirection(parsed.direction)) {
      return { field: "updatedAt", direction: "desc" };
    }
    return { field: parsed.field, direction: parsed.direction };
  } catch {
    return { field: "updatedAt", direction: "desc" };
  }
};

const writeStoredSortConfig = (config: {
  field: DrawingSortField;
  direction: SortDirection;
}) => {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(
      DASHBOARD_SORT_STORAGE_KEY,
      JSON.stringify(config),
    );
  } catch {
    // Ignore unavailable storage in private/embedded contexts.
  }
};

export const sortOptions: {
  field: DrawingSortField;
  label: string;
  icon: React.ReactNode;
}[] = [
  { field: "name", label: "Name", icon: <FileText size={16} /> },
  { field: "createdAt", label: "Date Created", icon: <Calendar size={16} /> },
  { field: "updatedAt", label: "Date Modified", icon: <Clock size={16} /> },
];

const sortSignature = (config: {
  field: DrawingSortField;
  direction: SortDirection;
}) => `${config.field}:${config.direction}`;

export const useDashboardSort = () => {
  const [sortConfig, setSortConfig] = useState<{
    field: DrawingSortField;
    direction: SortDirection;
  }>(() => readStoredSortConfig());
  // Gate server writes until the initial GET has settled, so a first-mount
  // effect run never PUTs the local default and clobbers the stored value.
  const hydratedRef = useRef(false);
  // Last signature we know the server already holds; skips redundant PUTs
  // (e.g. echoing back the value we just fetched).
  const lastPersistedRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getUserPreferences()
      .then((preferences) => {
        if (cancelled) return;
        if (
          isSortField(preferences.dashboardSortField) &&
          isSortDirection(preferences.dashboardSortDirection)
        ) {
          const serverConfig = {
            field: preferences.dashboardSortField,
            direction: preferences.dashboardSortDirection,
          };
          lastPersistedRef.current = sortSignature(serverConfig);
          setSortConfig(serverConfig);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) hydratedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    writeStoredSortConfig(sortConfig);
    if (!hydratedRef.current) return;
    const signature = sortSignature(sortConfig);
    if (lastPersistedRef.current === signature) return;
    lastPersistedRef.current = signature;
    api
      .updateUserPreferences({
        dashboardSortField: sortConfig.field,
        dashboardSortDirection: sortConfig.direction,
      })
      .catch(() => {});
  }, [sortConfig]);

  const handleSortFieldChange = (field: DrawingSortField) => {
    setSortConfig((current) => {
      if (current.field !== field) {
        return { field, direction: field === "name" ? "asc" : "desc" };
      }
      return current;
    });
  };

  const handleSortDirectionToggle = () => {
    setSortConfig((current) => ({
      ...current,
      direction: current.direction === "asc" ? "desc" : "asc",
    }));
  };

  return {
    sortConfig,
    sortOptions,
    currentSortOption:
      sortOptions.find((option) => option.field === sortConfig.field) ??
      sortOptions[0],
    handleSortFieldChange,
    handleSortDirectionToggle,
  };
};
