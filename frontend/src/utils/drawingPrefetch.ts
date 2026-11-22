import { getDrawing } from "../api";

type PendingDrawing = {
  request: ReturnType<typeof getDrawing>;
  controller: AbortController;
};

const pendingDrawings = new Map<string, PendingDrawing>();
let generation = 0;

const requestDrawing = (id: string, signal?: AbortSignal) => {
  const started = generation;
  return getDrawing(id, { omitPreview: true, signal }).then((drawing) => {
    signal?.throwIfAborted();
    if (started !== generation) {
      throw new DOMException("The drawing session changed", "AbortError");
    }
    return drawing;
  });
};

export const loadDrawing = (id: string) =>
  pendingDrawings.get(id)?.request ?? requestDrawing(id);

// A card click can hand an in-flight request to the editor. Completed
// responses are removed so each subsequent open checks access again.
export const prefetchDrawing = (id: string) => {
  if (pendingDrawings.has(id)) return;
  const controller = new AbortController();
  const request = requestDrawing(id, controller.signal).finally(() => {
    if (pendingDrawings.get(id)?.controller === controller) {
      pendingDrawings.delete(id);
    }
  });
  pendingDrawings.set(id, { request, controller });
  void request.catch(() => undefined);
};

export const invalidatePrefetchedDrawing = (id: string) => {
  pendingDrawings.get(id)?.controller.abort();
  pendingDrawings.delete(id);
};

export const clearDrawingPrefetchCache = () => {
  generation++;
  for (const id of pendingDrawings.keys()) invalidatePrefetchedDrawing(id);
};
