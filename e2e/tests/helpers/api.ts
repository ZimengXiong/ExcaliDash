import { APIRequestContext, expect } from "@playwright/test";

// Default ports match the Playwright config
const DEFAULT_BACKEND_PORT = 8000;

export const API_URL = process.env.API_URL || `http://localhost:${DEFAULT_BACKEND_PORT}`;

export interface DrawingRecord {
  id: string;
  name: string;
  collectionId: string | null;
  preview?: string | null;
  version?: number;
  createdAt?: number | string;
  updatedAt?: number | string;
  elements?: any[];
  appState?: Record<string, any> | null;
  files?: Record<string, any>;
}

export interface CollectionRecord {
  id: string;
  name: string;
  createdAt?: number | string;
}

export interface CreateDrawingOptions {
  name?: string;
  elements?: any[];
  appState?: Record<string, any>;
  files?: Record<string, any>;
  preview?: string | null;
  collectionId?: string | null;
}

export interface ListDrawingsOptions {
  search?: string;
  collectionId?: string | null;
  includeData?: boolean;
}

const defaultDrawingPayload = () => ({
  name: `E2E Drawing ${Date.now()}`,
  elements: [],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
  preview: null,
  collectionId: null as string | null,
});

export async function createDrawing(
  request: APIRequestContext,
  overrides: CreateDrawingOptions = {}
): Promise<DrawingRecord> {
  const payload = { ...defaultDrawingPayload(), ...overrides };
  const response = await request.post(`${API_URL}/drawings`, {
    headers: { "Content-Type": "application/json" },
    data: payload,
  });
  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`Failed to create drawing: ${response.status()} ${text}`);
  }
  return (await response.json()) as DrawingRecord;
}

export async function getDrawing(
  request: APIRequestContext,
  id: string
): Promise<DrawingRecord> {
  const response = await request.get(`${API_URL}/drawings/${id}`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as DrawingRecord;
}

export async function deleteDrawing(
  request: APIRequestContext,
  id: string
): Promise<void> {
  const response = await request.delete(`${API_URL}/drawings/${id}`);
  if (!response.ok()) {
    // Ignore not found to keep cleanup idempotent
    if (response.status() !== 404) {
      const text = await response.text();
      throw new Error(`Failed to delete drawing ${id}: ${response.status()} ${text}`);
    }
  }
}

export async function listDrawings(
  request: APIRequestContext,
  options: ListDrawingsOptions = {}
): Promise<DrawingRecord[]> {
  const params = new URLSearchParams();
  if (options.search) params.set("search", options.search);
  if (options.collectionId !== undefined) {
    params.set(
      "collectionId",
      options.collectionId === null ? "null" : String(options.collectionId)
    );
  }
  if (options.includeData) params.set("includeData", "true");

  const query = params.toString();
  const response = await request.get(
    `${API_URL}/drawings${query ? `?${query}` : ""}`
  );
  expect(response.ok()).toBe(true);
  return (await response.json()) as DrawingRecord[];
}

export async function createCollection(
  request: APIRequestContext,
  name: string
): Promise<CollectionRecord> {
  const response = await request.post(`${API_URL}/collections`, {
    headers: { "Content-Type": "application/json" },
    data: { name },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as CollectionRecord;
}

export async function listCollections(
  request: APIRequestContext
): Promise<CollectionRecord[]> {
  const response = await request.get(`${API_URL}/collections`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as CollectionRecord[];
}

export async function deleteCollection(
  request: APIRequestContext,
  id: string
): Promise<void> {
  const response = await request.delete(`${API_URL}/collections/${id}`);
  if (!response.ok()) {
    if (response.status() !== 404) {
      const text = await response.text();
      throw new Error(`Failed to delete collection ${id}: ${response.status()} ${text}`);
    }
  }
}
