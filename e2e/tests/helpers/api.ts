import { APIRequestContext, expect } from "@playwright/test";

// Default ports match the Playwright config
const DEFAULT_BACKEND_PORT = 8000;

export const API_URL = process.env.API_URL || `http://localhost:${DEFAULT_BACKEND_PORT}`;

type CsrfTokenResponse = {
  token: string;
  header?: string;
};

type CsrfInfo = {
  token: string;
  headerName: string;
};

// Cache CSRF tokens per Playwright request context so parallel tests don't race.
const csrfInfoByRequest = new WeakMap<APIRequestContext, CsrfInfo>();
const csrfFetchByRequest = new WeakMap<APIRequestContext, Promise<CsrfInfo>>();

const fetchCsrfInfo = async (request: APIRequestContext): Promise<CsrfInfo> => {
  const response = await request.get(`${API_URL}/csrf-token`);
  if (!response.ok()) {
    const text = await response.text();
    throw new Error(
      `Failed to fetch CSRF token: ${response.status()} ${text || "(empty response)"}`
    );
  }

  const data = (await response.json()) as CsrfTokenResponse;
  if (!data || typeof data.token !== "string" || data.token.trim().length === 0) {
    throw new Error("Failed to fetch CSRF token: missing token in response");
  }

  const headerName =
    typeof data.header === "string" && data.header.trim().length > 0
      ? data.header
      : "x-csrf-token";

  return { token: data.token, headerName };
};

const getCsrfInfo = async (request: APIRequestContext): Promise<CsrfInfo> => {
  const cached = csrfInfoByRequest.get(request);
  if (cached) return cached;

  const inFlight = csrfFetchByRequest.get(request);
  if (inFlight) return inFlight;

  const promise = fetchCsrfInfo(request)
    .then((info) => {
      csrfInfoByRequest.set(request, info);
      return info;
    })
    .finally(() => {
      csrfFetchByRequest.delete(request);
    });

  csrfFetchByRequest.set(request, promise);
  return promise;
};

const refreshCsrfInfo = async (request: APIRequestContext): Promise<CsrfInfo> => {
  const promise = fetchCsrfInfo(request)
    .then((info) => {
      csrfInfoByRequest.set(request, info);
      return info;
    })
    .finally(() => {
      csrfFetchByRequest.delete(request);
    });

  csrfFetchByRequest.set(request, promise);
  return promise;
};

export async function getCsrfHeaders(
  request: APIRequestContext
): Promise<Record<string, string>> {
  const info = await getCsrfInfo(request);
  return { [info.headerName]: info.token };
}

const withCsrfHeaders = async (
  request: APIRequestContext,
  headers: Record<string, string> = {}
): Promise<Record<string, string>> => ({
  ...headers,
  ...(await getCsrfHeaders(request)),
});

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
  const headers = await withCsrfHeaders(request, { "Content-Type": "application/json" });

  let response = await request.post(`${API_URL}/drawings`, {
    headers,
    data: payload,
  });

  // Retry once with a fresh token in case it expired or the cache was primed under
  // a different clientId (rare, but can happen under parallelism / CI proxies).
  if (!response.ok() && response.status() === 403) {
    await refreshCsrfInfo(request);
    const retryHeaders = await withCsrfHeaders(request, {
      "Content-Type": "application/json",
    });
    response = await request.post(`${API_URL}/drawings`, {
      headers: retryHeaders,
      data: payload,
    });
  }

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
  const headers = await withCsrfHeaders(request);
  let response = await request.delete(`${API_URL}/drawings/${id}`, { headers });

  if (!response.ok() && response.status() === 403) {
    await refreshCsrfInfo(request);
    const retryHeaders = await withCsrfHeaders(request);
    response = await request.delete(`${API_URL}/drawings/${id}`, {
      headers: retryHeaders,
    });
  }

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
  const headers = await withCsrfHeaders(request, { "Content-Type": "application/json" });

  let response = await request.post(`${API_URL}/collections`, {
    headers,
    data: { name },
  });

  if (!response.ok() && response.status() === 403) {
    await refreshCsrfInfo(request);
    const retryHeaders = await withCsrfHeaders(request, {
      "Content-Type": "application/json",
    });
    response = await request.post(`${API_URL}/collections`, {
      headers: retryHeaders,
      data: { name },
    });
  }

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
  const headers = await withCsrfHeaders(request);
  let response = await request.delete(`${API_URL}/collections/${id}`, { headers });

  if (!response.ok() && response.status() === 403) {
    await refreshCsrfInfo(request);
    const retryHeaders = await withCsrfHeaders(request);
    response = await request.delete(`${API_URL}/collections/${id}`, {
      headers: retryHeaders,
    });
  }

  if (!response.ok()) {
    if (response.status() !== 404) {
      const text = await response.text();
      throw new Error(`Failed to delete collection ${id}: ${response.status()} ${text}`);
    }
  }
}
