import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { buildRemoteSceneUpdate } from "./shared";

export type AgentBatch = {
  opsBatchId?: string;
  elements: any[];
  elementOrder: string[] | null;
};

type UseAgentBatchApplierArgs = {
  excalidrawAPI: MutableRefObject<any>;
  isSyncing: MutableRefObject<boolean>;
  lastSyncedElementOrderSigRef: MutableRefObject<string>;
  latestElementsRef: MutableRefObject<readonly any[]>;
  computeElementOrderSig: (elements: readonly any[]) => string;
  recordElementVersion: (element: any) => void;
  /**
   * Ids of agent op batches this client originated (chat panel). A matching
   * batch is replayed with IMMEDIATELY capture so the requesting user can
   * natively Ctrl+Z the agent edit (D5). Ids are consumed on apply.
   */
  selfAgentBatchIdsRef?: MutableRefObject<Set<string>>;
};

/**
 * Buffers agent op batches (socket `element-update` with `origin: "agent-ops"`)
 * and applies each atomically on the next animation frame. The one-frame defer
 * lets the SSE `ops_applied` handler (same event loop) register the batch id as
 * self-originated before we resolve the undo-capture mode. Ops never mutate
 * files, so this path handles elements/order only. Returns an `enqueue` fn.
 */
export const useAgentBatchApplier = ({
  excalidrawAPI,
  isSyncing,
  lastSyncedElementOrderSigRef,
  latestElementsRef,
  computeElementOrderSig,
  recordElementVersion,
  selfAgentBatchIdsRef,
}: UseAgentBatchApplierArgs): ((batch: AgentBatch) => void) => {
  const pendingRef = useRef<AgentBatch[]>([]);
  const rafRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;
    if (!excalidrawAPI.current) return;
    const batches = pendingRef.current;
    pendingRef.current = [];
    const selfSet = selfAgentBatchIdsRef?.current;
    isSyncing.current = true;
    try {
      for (const batch of batches) {
        const isSelf = Boolean(
          batch.opsBatchId && selfSet?.has(batch.opsBatchId),
        );
        const { sceneUpdate, mergedElements } = buildRemoteSceneUpdate({
          localElements:
            excalidrawAPI.current.getSceneElementsIncludingDeleted(),
          pendingElements: batch.elements,
          elementOrder: batch.elementOrder,
          captureUpdate: isSelf ? "IMMEDIATELY" : "NEVER",
        });
        if (mergedElements) {
          if (batch.elementOrder) {
            lastSyncedElementOrderSigRef.current =
              computeElementOrderSig(mergedElements);
          }
          batch.elements.forEach((el: any) => recordElementVersion(el));
          if (sceneUpdate) excalidrawAPI.current.updateScene(sceneUpdate);
          latestElementsRef.current = mergedElements;
        } else if (sceneUpdate) {
          excalidrawAPI.current.updateScene(sceneUpdate);
        }
        if (isSelf && batch.opsBatchId) selfSet?.delete(batch.opsBatchId);
      }
    } finally {
      isSyncing.current = false;
    }
  }, [
    excalidrawAPI,
    isSyncing,
    lastSyncedElementOrderSigRef,
    latestElementsRef,
    computeElementOrderSig,
    recordElementVersion,
    selfAgentBatchIdsRef,
  ]);

  const enqueue = useCallback(
    (batch: AgentBatch) => {
      pendingRef.current.push(batch);
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(flush);
    },
    [flush],
  );

  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      pendingRef.current = [];
    },
    [],
  );

  return enqueue;
};
