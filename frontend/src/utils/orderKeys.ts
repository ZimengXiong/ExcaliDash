/**
 * Excalidraw orders elements by fractional-index keys (`element.index`). A
 * single malformed key (from an API client, import or older tool) makes
 * Excalidraw throw "invalid order key" while restoring, and the editor stays
 * on "Loading scene..." forever. Dropping malformed keys lets Excalidraw
 * regenerate them from array order, which is what it does for missing keys.
 *
 * Validation mirrors the `fractional-indexing` package Excalidraw uses.
 */
const BASE_62 = /^[0-9A-Za-z]+$/;
const SMALLEST_INTEGER = "A" + "0".repeat(26);

const integerLength = (head: string): number | null => {
  if (head >= "a" && head <= "z") {
    return head.charCodeAt(0) - "a".charCodeAt(0) + 2;
  }
  if (head >= "A" && head <= "Z") {
    return "Z".charCodeAt(0) - head.charCodeAt(0) + 2;
  }
  return null;
};

export const isValidOrderKey = (key: unknown): key is string => {
  if (typeof key !== "string" || key.length === 0) return false;
  if (key === SMALLEST_INTEGER || !BASE_62.test(key)) return false;
  const length = integerLength(key[0]);
  if (length === null || key.length < length) return false;
  const fraction = key.slice(length);
  return !fraction.endsWith("0");
};

/** Remove malformed `index` keys; returns the input array when none are. */
export const dropInvalidOrderKeys = <T>(elements: readonly T[]): T[] => {
  let changed = false;
  const result = elements.map((element) => {
    const index = (element as { index?: unknown } | null)?.index;
    if (index === undefined || index === null || isValidOrderKey(index)) {
      return element;
    }
    changed = true;
    const { index: _dropped, ...rest } = element as Record<string, unknown>;
    return rest as T;
  });
  return changed ? result : (elements as T[]);
};
