import React from "react";
import { Calendar, Clock, FileText } from "lucide-react";
import type { DrawingSortField, SortDirection } from "../../api";
import {
  usePreference,
  usePreferences,
} from "../../context/PreferencesContext";
import { useLocale } from "../../context/useLocale";
import type { TranslationKey } from "../../i18n";

const DEFAULT_SORT_FIELD: DrawingSortField = "updatedAt";
const DEFAULT_SORT_DIRECTION: SortDirection = "desc";

const isSortField = (value: unknown): value is DrawingSortField =>
  value === "name" || value === "createdAt" || value === "updatedAt";

const isSortDirection = (value: unknown): value is SortDirection =>
  value === "asc" || value === "desc";

const sortOptionDefinitions: {
  field: DrawingSortField;
  labelKey: TranslationKey;
  icon: React.ReactNode;
}[] = [
  {
    field: "name",
    labelKey: "dashboard.sort.name",
    icon: <FileText size={16} />,
  },
  {
    field: "createdAt",
    labelKey: "dashboard.sort.createdAt",
    icon: <Calendar size={16} />,
  },
  {
    field: "updatedAt",
    labelKey: "dashboard.sort.updatedAt",
    icon: <Clock size={16} />,
  },
];

export const useDashboardSort = () => {
  // Server-backed via the shared preferences context, which owns the
  // no-clobber-on-first-mount gate and refetch-on-user-change behavior.
  const { t } = useLocale();
  const sortOptions = sortOptionDefinitions.map(({ labelKey, ...option }) => ({
    ...option,
    label: t(labelKey),
  }));
  const { updatePreferences } = usePreferences();
  const [field] = usePreference("dashboardSortField", DEFAULT_SORT_FIELD);
  const [direction] = usePreference(
    "dashboardSortDirection",
    DEFAULT_SORT_DIRECTION,
  );
  const sortConfig = {
    field: isSortField(field) ? field : DEFAULT_SORT_FIELD,
    direction: isSortDirection(direction) ? direction : DEFAULT_SORT_DIRECTION,
  };

  const handleSortFieldChange = (nextField: DrawingSortField) => {
    if (sortConfig.field === nextField) return;
    updatePreferences({
      dashboardSortField: nextField,
      dashboardSortDirection: nextField === "name" ? "asc" : "desc",
    });
  };

  const handleSortDirectionToggle = () => {
    updatePreferences({
      dashboardSortDirection: sortConfig.direction === "asc" ? "desc" : "asc",
    });
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
