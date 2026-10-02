import type { DrawingSummary } from "../../types";

export const isLatestRequest = (
  requestVersion: number,
  currentVersion: number,
): boolean => requestVersion === currentVersion;

export const mergeUniqueDrawings = (
  existing: DrawingSummary[],
  incoming: DrawingSummary[],
): DrawingSummary[] => {
  const seen = new Set(existing.map((d) => d.id));
  const nextPage = incoming.filter((d) => !seen.has(d.id));
  return [...existing, ...nextPage];
};
