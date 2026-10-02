import { useCallback, useRef } from "react";
import { getElementContentSig } from "./shared";
import type { ElementVersionInfo } from "./shared";

export const useEditorElementTracking = () => {
  const elementVersionMap = useRef<Map<string, ElementVersionInfo>>(new Map());

  const recordElementVersion = useCallback((element: any) => {
    elementVersionMap.current.set(element.id, {
      version: element.version ?? 0,
      versionNonce: element.versionNonce ?? 0,
      updated:
        typeof element?.updated === "number"
          ? element.updated
          : Number(element?.updated) || 0,
      contentSig: getElementContentSig(element),
    });
  }, []);

  const hasElementChanged = useCallback((element: any) => {
    const previous = elementVersionMap.current.get(element.id);
    if (!previous) return true;
    const nextVersion = element.version ?? 0;
    const nextNonce = element.versionNonce ?? 0;
    const nextUpdated =
      typeof element?.updated === "number"
        ? element.updated
        : Number(element?.updated) || 0;
    const nextSig = getElementContentSig(element);
    return (
      previous.version !== nextVersion ||
      previous.versionNonce !== nextNonce ||
      previous.updated !== nextUpdated ||
      previous.contentSig !== nextSig
    );
  }, []);

  const computeElementOrderSig = useCallback((elements: readonly any[]) => {
    let hash = 2166136261;
    let count = 0;
    for (const el of elements) {
      const id = typeof el?.id === "string" ? el.id : "";
      if (!id) continue;
      count += 1;
      for (let i = 0; i < id.length; i++) {
        hash ^= id.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      hash ^= 124;
      hash = Math.imul(hash, 16777619);
    }
    return `${count}:${(hash >>> 0).toString(16)}`;
  }, []);

  return {
    computeElementOrderSig,
    elementVersionMap,
    hasElementChanged,
    recordElementVersion,
  };
};
