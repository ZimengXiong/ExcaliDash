import { useCallback, useRef } from "react";
import {
  matchesElementContent,
  snapshotElementContent,
} from "../../utils/sync";

type ElementVersionInfo = {
  version: number;
  versionNonce: number;
  updated: number;
  content: ReturnType<typeof snapshotElementContent>;
};

const getUpdated = (element: any): number =>
  typeof element.updated === "number"
    ? element.updated
    : Number(element.updated) || 0;

export const useEditorElementTracking = () => {
  const elementVersionMap = useRef<Map<string, ElementVersionInfo>>(new Map());

  const recordElementVersion = useCallback((element: any) => {
    elementVersionMap.current.set(element.id, {
      version: element.version ?? 0,
      versionNonce: element.versionNonce ?? 0,
      updated: getUpdated(element),
      content: snapshotElementContent(element),
    });
  }, []);

  const hasElementChanged = useCallback((element: any, status?: unknown) => {
    const previous = elementVersionMap.current.get(element.id);
    return (
      !previous ||
      previous.version !== (element.version ?? 0) ||
      previous.versionNonce !== (element.versionNonce ?? 0) ||
      previous.updated !== getUpdated(element) ||
      !matchesElementContent(previous.content, element, status)
    );
  }, []);

  return {
    elementVersionMap,
    hasElementChanged,
    recordElementVersion,
  };
};
