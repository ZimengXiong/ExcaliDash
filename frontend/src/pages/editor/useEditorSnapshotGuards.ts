import { useCallback } from "react";
import type { RefObject } from "react";
import {
  hasRenderableElements,
  isStaleEmptySnapshot,
  isStaleNonRenderableSnapshot,
} from "./shared";

type UseEditorSnapshotGuardsParams = {
  lastPersistedElementsRef: RefObject<readonly any[]>;
  initialSceneElementsRef: RefObject<readonly any[]>;
  latestElementsRef: RefObject<readonly any[]>;
};

export const useEditorSnapshotGuards = ({
  lastPersistedElementsRef,
  initialSceneElementsRef,
  latestElementsRef,
}: UseEditorSnapshotGuardsParams) => {
  const getRenderableBaselineSnapshot = useCallback((): readonly any[] => {
    const lastPersistedElements = lastPersistedElementsRef.current ?? [];
    const initialSceneElements = initialSceneElementsRef.current ?? [];
    const latestElements = latestElementsRef.current ?? [];
    if (hasRenderableElements(lastPersistedElements)) {
      return lastPersistedElements;
    }
    if (hasRenderableElements(initialSceneElements)) {
      return initialSceneElements;
    }
    return latestElements;
  }, [initialSceneElementsRef, lastPersistedElementsRef, latestElementsRef]);

  const hasIntentionalDeletionDelta = useCallback(
    (
      baseline: readonly any[] = [],
      candidate: readonly any[] = [],
    ): boolean => {
      if (!Array.isArray(candidate) || candidate.length === 0) return false;
      if (!hasRenderableElements(baseline)) return false;
      if (hasRenderableElements(candidate)) return false;
      const baselineById = new Map(
        baseline.map((element: any) => [element?.id, element]),
      );
      const getVersion = (element: any): number =>
        typeof element?.version === "number" ? element.version : 0;
      const getUpdated = (element: any): number => {
        const value = element?.updated;
        return typeof value === "number" ? value : Number(value) || 0;
      };
      return candidate.some((element: any) => {
        if (
          !element ||
          element.isDeleted !== true ||
          typeof element.id !== "string"
        ) {
          return false;
        }
        const previous = baselineById.get(element.id);
        if (!previous) return false;
        if (previous.isDeleted === true) return false;
        const nextVersion = getVersion(element);
        const prevVersion = getVersion(previous);
        if (nextVersion > prevVersion) return true;
        const nextUpdated = getUpdated(element);
        const prevUpdated = getUpdated(previous);
        if (nextVersion === prevVersion && nextUpdated > prevUpdated) {
          return true;
        }
        return nextVersion === prevVersion && nextUpdated === prevUpdated;
      });
    },
    [],
  );

  const resolveSafeSnapshot = useCallback(
    (candidateSnapshot: readonly any[] = []) => {
      const baseline = getRenderableBaselineSnapshot();
      const staleEmptySnapshot = isStaleEmptySnapshot(
        baseline,
        candidateSnapshot,
      );
      const staleNonRenderableSnapshot = isStaleNonRenderableSnapshot(
        baseline,
        candidateSnapshot,
      );
      const intentionalDeletionDelta = staleNonRenderableSnapshot
        ? hasIntentionalDeletionDelta(baseline, candidateSnapshot)
        : false;
      if (
        staleEmptySnapshot ||
        (staleNonRenderableSnapshot && !intentionalDeletionDelta)
      ) {
        return {
          snapshot: baseline,
          prevented: true,
          staleEmptySnapshot,
          staleNonRenderableSnapshot,
        } as const;
      }
      return {
        snapshot: candidateSnapshot,
        prevented: false,
        staleEmptySnapshot: false,
        staleNonRenderableSnapshot: false,
      } as const;
    },
    [getRenderableBaselineSnapshot, hasIntentionalDeletionDelta],
  );

  const normalizeImageElementStatus = useCallback(
    (
      elements: readonly any[] = [],
      files?: Record<string, any> | null,
    ): readonly any[] => {
      if (!Array.isArray(elements) || elements.length === 0) return elements;
      const fileMap = files || {};
      let changed = false;
      const normalized = elements.map((element: any) => {
        if (
          !element ||
          element.type !== "image" ||
          typeof element.fileId !== "string"
        ) {
          return element;
        }
        const file = fileMap[element.fileId];
        const hasImageData =
          typeof file?.dataURL === "string" &&
          file.dataURL.startsWith("data:image/") &&
          file.dataURL.length > 0;
        if (!hasImageData || element.status === "saved") {
          return element;
        }
        changed = true;
        return { ...element, status: "saved" };
      });
      return changed ? normalized : elements;
    },
    [],
  );

  return {
    getRenderableBaselineSnapshot,
    hasIntentionalDeletionDelta,
    resolveSafeSnapshot,
    normalizeImageElementStatus,
  };
};
