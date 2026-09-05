import { describe, expect, it } from "vitest";
import { isLikelyTrackpadWheelEvent } from "./canvasZoomForwarding";

const wheelEvent = (deltaX: number, deltaY: number): WheelEvent =>
  ({ deltaX, deltaY }) as WheelEvent;

describe("isLikelyTrackpadWheelEvent", () => {
  it("treats a whole-number, vertical-only wheel tick as a mouse wheel", () => {
    expect(isLikelyTrackpadWheelEvent(wheelEvent(0, 100))).toBe(false);
  });

  it("treats a small whole-number vertical tick as a mouse wheel", () => {
    expect(isLikelyTrackpadWheelEvent(wheelEvent(0, 3))).toBe(false);
  });

  it("treats a negative whole-number vertical tick as a mouse wheel", () => {
    expect(isLikelyTrackpadWheelEvent(wheelEvent(0, -120))).toBe(false);
  });

  it("treats an all-zero event as a mouse wheel (no signal otherwise)", () => {
    expect(isLikelyTrackpadWheelEvent(wheelEvent(0, 0))).toBe(false);
  });

  it("treats a nonzero deltaX as a trackpad gesture", () => {
    expect(isLikelyTrackpadWheelEvent(wheelEvent(-5, 12))).toBe(true);
  });

  it("treats a fractional deltaY as a trackpad gesture", () => {
    expect(isLikelyTrackpadWheelEvent(wheelEvent(0, 2.4))).toBe(true);
  });

  it("treats a fractional deltaX as a trackpad gesture", () => {
    expect(isLikelyTrackpadWheelEvent(wheelEvent(0.75, 0))).toBe(true);
  });
});
