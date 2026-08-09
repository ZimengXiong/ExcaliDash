import {
  ExcalidrawElement,
  genId,
  touchElement,
} from "./elementFactory";
import type { Op } from "./opSchemas";

/** The subset of the working scene the import applier needs. */
export type ImportScene = {
  add(el: ExcalidrawElement): void;
};

export const applyImport = (
  scene: ImportScene,
  op: Extract<Op, { op: "import_elements" }>,
) => {
  // Insert-only: every incoming id is remapped to a fresh id so an import can
  // never overwrite existing elements, and intra-batch references are rewritten
  // to the new ids.
  const idMap = new Map<string, string>();
  for (const raw of op.elements) {
    if (typeof raw.id === "string") idMap.set(raw.id, genId());
  }
  const remapId = (id: unknown): unknown =>
    typeof id === "string" && idMap.has(id) ? idMap.get(id) : id;

  const createdIds: string[] = [];
  for (const raw of op.elements) {
    const el: ExcalidrawElement = { ...raw };
    el.id = (typeof raw.id === "string" && idMap.get(raw.id)) || genId();
    el.isDeleted = false;
    touchElement(el);
    el.version = 1;
    if (typeof el.containerId === "string") el.containerId = remapId(el.containerId);
    if (typeof el.frameId === "string") el.frameId = remapId(el.frameId);
    if (Array.isArray(el.boundElements)) {
      el.boundElements = el.boundElements.map((b: any) =>
        b && typeof b.id === "string" ? { ...b, id: remapId(b.id) } : b,
      );
    }
    if (el.startBinding?.elementId) {
      el.startBinding = { ...el.startBinding, elementId: remapId(el.startBinding.elementId) };
    }
    if (el.endBinding?.elementId) {
      el.endBinding = { ...el.endBinding, elementId: remapId(el.endBinding.elementId) };
    }
    scene.add(el);
    createdIds.push(el.id);
  }
  return { createdIds };
};
