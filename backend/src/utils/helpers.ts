/**
 * Common helper utilities for the backend
 */

/**
 * Safely parse a JSON field with a fallback value
 */
export const parseJsonField = <T>(
  rawValue: string | null | undefined,
  fallback: T
): T => {
  if (!rawValue) return fallback;
  try {
    return JSON.parse(rawValue) as T;
  } catch (error) {
    console.warn("Failed to parse JSON field", {
      error,
      valuePreview: rawValue.slice(0, 50),
    });
    return fallback;
  }
};

/**
 * Serialize a drawing from database format to API response format
 * Fixes duplicated JSON.parse pattern that appeared 5+ times
 */
export const serializeDrawingResponse = (drawing: {
  id: string;
  name: string;
  elements: string;
  appState: string;
  files: string | null;
  collectionId: string | null;
  preview: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  ...drawing,
  elements: parseJsonField(drawing.elements, []),
  appState: parseJsonField(drawing.appState, {}),
  files: parseJsonField(drawing.files, {}),
});

/**
 * Type for the serialized drawing response
 */
export type SerializedDrawing = ReturnType<typeof serializeDrawingResponse>;
