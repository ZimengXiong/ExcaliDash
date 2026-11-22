import { describe, expect, it } from "vitest";
import { fitDroppedImageToViewport } from "../src/pages/editor/droppedImages";

describe("fitDroppedImageToViewport", () => {
  it("caps the height at half the viewport, keeping the aspect ratio", () => {
    const fitted = fitDroppedImageToViewport(
      { width: 3840, height: 2160 },
      { height: 1000, zoom: 1 },
    );
    expect(fitted.height).toBe(500);
    expect(fitted.width).toBeCloseTo(888.89, 2);
  });

  it("measures the cap on screen, so zooming in shrinks the image", () => {
    expect(
      fitDroppedImageToViewport(
        { width: 400, height: 400 },
        { height: 1000, zoom: 2 },
      ),
    ).toEqual({ width: 250, height: 250 });
  });

  it("never scales a small image up", () => {
    expect(
      fitDroppedImageToViewport(
        { width: 120, height: 80 },
        { height: 1000, zoom: 1 },
      ),
    ).toEqual({ width: 120, height: 80 });
  });
});
