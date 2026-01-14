/**
 * Tests for utils/helpers.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseJsonField, serializeDrawingResponse } from "../utils/helpers";

describe("parseJsonField", () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it("should parse valid JSON string", () => {
    const result = parseJsonField('{"key": "value"}', {});
    expect(result).toEqual({ key: "value" });
  });

  it("should parse valid JSON array", () => {
    const result = parseJsonField('[1, 2, 3]', []);
    expect(result).toEqual([1, 2, 3]);
  });

  it("should return fallback for null input", () => {
    const fallback = { default: true };
    const result = parseJsonField(null, fallback);
    expect(result).toEqual(fallback);
  });

  it("should return fallback for undefined input", () => {
    const fallback = ["default"];
    const result = parseJsonField(undefined, fallback);
    expect(result).toEqual(fallback);
  });

  it("should return fallback for empty string", () => {
    const fallback = { empty: true };
    const result = parseJsonField("", fallback);
    expect(result).toEqual(fallback);
  });

  it("should return fallback for invalid JSON and log warning", () => {
    const fallback = { fallback: true };
    const result = parseJsonField("not valid json", fallback);
    expect(result).toEqual(fallback);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "Failed to parse JSON field",
      expect.objectContaining({
        error: expect.any(SyntaxError),
        valuePreview: "not valid json",
      })
    );
  });

  it("should truncate long invalid JSON in warning", () => {
    const longInvalidJson = "x".repeat(100);
    const fallback = {};
    parseJsonField(longInvalidJson, fallback);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "Failed to parse JSON field",
      expect.objectContaining({
        valuePreview: "x".repeat(50),
      })
    );
  });

  it("should handle nested JSON objects", () => {
    const nested = '{"level1": {"level2": {"level3": "deep"}}}';
    const result = parseJsonField(nested, {});
    expect(result).toEqual({ level1: { level2: { level3: "deep" } } });
  });

  it("should handle JSON with special characters", () => {
    const json = '{"text": "hello\\nworld", "emoji": "🎨"}';
    const result = parseJsonField(json, {});
    expect(result).toEqual({ text: "hello\nworld", emoji: "🎨" });
  });
});

describe("serializeDrawingResponse", () => {
  const createMockDrawing = (overrides = {}) => ({
    id: "test-id-123",
    name: "Test Drawing",
    elements: '[]',
    appState: '{}',
    files: null,
    collectionId: null,
    preview: null,
    version: 1,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-02"),
    ...overrides,
  });

  it("should serialize a basic drawing with empty data", () => {
    const drawing = createMockDrawing();
    const result = serializeDrawingResponse(drawing);

    expect(result.id).toBe("test-id-123");
    expect(result.name).toBe("Test Drawing");
    expect(result.elements).toEqual([]);
    expect(result.appState).toEqual({});
    expect(result.files).toEqual({});
    expect(result.collectionId).toBeNull();
    expect(result.preview).toBeNull();
    expect(result.version).toBe(1);
  });

  it("should parse elements JSON correctly", () => {
    const elements = [
      { id: "elem1", type: "rectangle", x: 0, y: 0 },
      { id: "elem2", type: "ellipse", x: 100, y: 100 },
    ];
    const drawing = createMockDrawing({ elements: JSON.stringify(elements) });
    const result = serializeDrawingResponse(drawing);

    expect(result.elements).toEqual(elements);
    expect(result.elements).toHaveLength(2);
  });

  it("should parse appState JSON correctly", () => {
    const appState = {
      viewBackgroundColor: "#ffffff",
      gridSize: 20,
      zoom: { value: 1.5 },
    };
    const drawing = createMockDrawing({ appState: JSON.stringify(appState) });
    const result = serializeDrawingResponse(drawing);

    expect(result.appState).toEqual(appState);
    expect(result.appState.viewBackgroundColor).toBe("#ffffff");
  });

  it("should parse files JSON correctly", () => {
    const files = {
      "file-1": { mimeType: "image/png", dataURL: "data:image/png;base64,abc" },
      "file-2": { mimeType: "image/jpeg", dataURL: "data:image/jpeg;base64,xyz" },
    };
    const drawing = createMockDrawing({ files: JSON.stringify(files) });
    const result = serializeDrawingResponse(drawing);

    expect(result.files).toEqual(files);
    expect(Object.keys(result.files)).toHaveLength(2);
  });

  it("should handle null files field", () => {
    const drawing = createMockDrawing({ files: null });
    const result = serializeDrawingResponse(drawing);

    expect(result.files).toEqual({});
  });

  it("should preserve other fields unchanged", () => {
    const drawing = createMockDrawing({
      collectionId: "collection-123",
      preview: "<svg>...</svg>",
      version: 42,
    });
    const result = serializeDrawingResponse(drawing);

    expect(result.collectionId).toBe("collection-123");
    expect(result.preview).toBe("<svg>...</svg>");
    expect(result.version).toBe(42);
  });

  it("should preserve date objects", () => {
    const createdAt = new Date("2024-06-15T10:30:00Z");
    const updatedAt = new Date("2024-06-16T14:45:00Z");
    const drawing = createMockDrawing({ createdAt, updatedAt });
    const result = serializeDrawingResponse(drawing);

    expect(result.createdAt).toEqual(createdAt);
    expect(result.updatedAt).toEqual(updatedAt);
  });
});
