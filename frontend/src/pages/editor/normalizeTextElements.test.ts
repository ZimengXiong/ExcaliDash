import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeTextElementDimensions } from "./normalizeTextElements";

describe("normalizeTextElementDimensions", () => {
  const restoreElements = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("leaves a scene without text untouched", () => {
    const elements = [{ id: "r1", type: "rectangle" }];

    expect(normalizeTextElementDimensions(elements, restoreElements)).toBe(
      elements,
    );
    expect(restoreElements).not.toHaveBeenCalled();
  });

  it("asks Excalidraw to remeasure text and repair bound labels", () => {
    const elements = [
      {
        id: "r1",
        type: "rectangle",
        x: 20,
        y: 40,
        width: 200,
        height: 100,
        boundElements: [{ id: "t1", type: "text" }],
      },
      {
        id: "t1",
        type: "text",
        x: 120,
        y: 90,
        width: 80,
        height: 25,
        text: "Label",
        textAlign: "center",
        verticalAlign: "middle",
        containerId: "r1",
      },
    ];
    const restored = [
      { ...elements[0] },
      { ...elements[1], width: 50, height: 25 },
    ];
    vi.mocked(restoreElements).mockReturnValue(restored as any);

    expect(normalizeTextElementDimensions(elements, restoreElements)).toBe(restored);
    expect(restoreElements).toHaveBeenCalledWith(
      [
        elements[0],
        expect.objectContaining({ x: 80, y: 77.5 }),
      ],
      null,
      {
        repairBindings: true,
        refreshDimensions: true,
      },
    );
  });

  it("does not recenter standalone or deliberately aligned text", () => {
    const elements = [
      { id: "r1", type: "rectangle", x: 0, y: 0, width: 200, height: 100 },
      { id: "t1", type: "text", x: 10, y: 20, width: 50, height: 25 },
      {
        id: "t2",
        type: "text",
        x: 30,
        y: 40,
        width: 50,
        height: 25,
        textAlign: "left",
        verticalAlign: "middle",
        containerId: "r1",
      },
    ];
    vi.mocked(restoreElements).mockReturnValue(elements as any);

    normalizeTextElementDimensions(elements, restoreElements);

    expect(restoreElements).toHaveBeenCalledWith(
      elements,
      null,
      expect.any(Object),
    );
  });

  it("falls back to the incoming scene when restoration fails", () => {
    const elements = [{ id: "t1", type: "text", text: "Label" }];
    vi.mocked(restoreElements).mockImplementationOnce(() => {
      throw new Error("bad element");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(normalizeTextElementDimensions(elements, restoreElements)).toBe(elements);
  });
});
