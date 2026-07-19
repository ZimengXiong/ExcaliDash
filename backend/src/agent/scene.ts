import {
  centerOf,
  edgePointToward,
  type ExcalidrawElement,
  touchElement,
  updateTextMetrics,
} from "./elementFactory";

// Working scene: array preserves z-order; map indexes elements by id. Both hold
// the same object references, so in-place mutation is visible through either.
export class Scene {
  elements: ExcalidrawElement[];
  private byId = new Map<string, ExcalidrawElement>();
  changed = new Set<string>();
  orderChanged = false;

  constructor(elements: ExcalidrawElement[]) {
    this.elements = elements.map((el) => ({ ...el }));
    for (const el of this.elements) {
      if (typeof el.id === "string") this.byId.set(el.id, el);
    }
  }

  get(id: string): ExcalidrawElement | undefined {
    return this.byId.get(id);
  }

  getLive(id: string): ExcalidrawElement | undefined {
    const el = this.byId.get(id);
    return !el || el.isDeleted ? undefined : el;
  }

  add(el: ExcalidrawElement): void {
    this.elements.push(el);
    if (typeof el.id === "string") this.byId.set(el.id, el);
    this.changed.add(el.id);
    this.orderChanged = true;
  }

  markChanged(el: ExcalidrawElement): void {
    touchElement(el);
    this.changed.add(el.id);
  }

  boundLabelOf(container: ExcalidrawElement): ExcalidrawElement | undefined {
    const refs = Array.isArray(container.boundElements)
      ? container.boundElements
      : [];
    for (const ref of refs) {
      if (ref?.type === "text" && typeof ref.id === "string") {
        const label = this.byId.get(ref.id);
        if (label && !label.isDeleted) return label;
      }
    }
    return undefined;
  }

  liveElements(ids: string[]): ExcalidrawElement[] | null {
    const elements = ids.map((id) => this.getLive(id));
    return elements.every(Boolean) ? (elements as ExcalidrawElement[]) : null;
  }

  moveBy(el: ExcalidrawElement, dx: number, dy: number): void {
    el.x = (el.x ?? 0) + dx;
    el.y = (el.y ?? 0) + dy;
    this.markChanged(el);
    const label = this.boundLabelOf(el);
    if (label) {
      label.x = (label.x ?? 0) + dx;
      label.y = (label.y ?? 0) + dy;
      this.markChanged(label);
    }
  }

  rerouteBindings(): void {
    for (const arrow of this.elements) {
      if (
        arrow.isDeleted ||
        (arrow.type !== "arrow" && arrow.type !== "line") ||
        !arrow.startBinding?.elementId ||
        !arrow.endBinding?.elementId
      ) continue;
      const from = this.getLive(arrow.startBinding.elementId);
      const to = this.getLive(arrow.endBinding.elementId);
      if (!from || !to) continue;
      const fromCenter = centerOf(from);
      const toCenter = centerOf(to);
      const start = edgePointToward(from, toCenter);
      const end = edgePointToward(to, fromCenter);
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const geometryChanged =
        arrow.x !== start.x ||
        arrow.y !== start.y ||
        arrow.width !== Math.abs(dx) ||
        arrow.height !== Math.abs(dy) ||
        arrow.points?.[1]?.[0] !== dx ||
        arrow.points?.[1]?.[1] !== dy;
      arrow.x = start.x;
      arrow.y = start.y;
      arrow.width = Math.abs(dx);
      arrow.height = Math.abs(dy);
      arrow.points = [[0, 0], [dx, dy]];
      if (geometryChanged) this.markChanged(arrow);
      const label = this.boundLabelOf(arrow);
      if (label) {
        const previous = [label.x, label.y, label.width, label.height, label.text];
        updateTextMetrics(label, {
          center: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
        });
        if (
          previous.some(
            (value, index) =>
              value !== [label.x, label.y, label.width, label.height, label.text][index],
          )
        ) this.markChanged(label);
      }
    }
  }
}
