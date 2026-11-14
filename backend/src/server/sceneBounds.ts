export type SceneBounds = [number, number, number, number];

// Scene coordinates far beyond anything a real canvas reaches. Followers jump
// to whatever bounds the person they follow reports, so values near the float
// limits could overflow into an Infinity/NaN scroll position and blank the
// follower's canvas.
export const MAX_SCENE_COORDINATE = 1e8;

// [minX, minY, maxX, maxY] of a viewport in scene coordinates.
export const isSceneBounds = (value: unknown): value is SceneBounds =>
  Array.isArray(value) &&
  value.length === 4 &&
  value.every(
    (n) =>
      typeof n === "number" &&
      Number.isFinite(n) &&
      Math.abs(n) <= MAX_SCENE_COORDINATE,
  ) &&
  value[0] <= value[2] &&
  value[1] <= value[3];
