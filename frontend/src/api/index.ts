import axios from "axios";
import type { Drawing, Collection, DrawingSummary } from "../types";

export const API_URL = import.meta.env.VITE_API_URL || "/api";

export const api = axios.create({
  baseURL: API_URL,
});

// CSRF Token Management
let csrfToken: string | null = null;
let csrfHeaderName: string = "x-csrf-token";
let csrfTokenPromise: Promise<void> | null = null;

/**
 * Fetch a fresh CSRF token from the server
 */
export const fetchCsrfToken = async (): Promise<void> => {
  try {
    const response = await axios.get<{ token: string; header: string }>(
      `${API_URL}/csrf-token`
    );
    csrfToken = response.data.token;
    csrfHeaderName = response.data.header || "x-csrf-token";
  } catch (error) {
    console.error("Failed to fetch CSRF token:", error);
    throw error;
  }
};

/**
 * Ensure we have a valid CSRF token, fetching one if needed
 */
const ensureCsrfToken = async (): Promise<void> => {
  if (csrfToken) return;

  // Prevent multiple simultaneous token fetches
  if (!csrfTokenPromise) {
    csrfTokenPromise = fetchCsrfToken().finally(() => {
      csrfTokenPromise = null;
    });
  }
  await csrfTokenPromise;
};

/**
 * Clear the cached CSRF token (useful for handling 403 errors)
 */
export const clearCsrfToken = (): void => {
  csrfToken = null;
};

// Add request interceptor to include CSRF token
api.interceptors.request.use(
  async (config) => {
    // Only add CSRF token for state-changing methods
    const method = config.method?.toUpperCase();
    if (method && ["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
      await ensureCsrfToken();
      if (csrfToken) {
        config.headers[csrfHeaderName] = csrfToken;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add response interceptor to handle CSRF token errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // If we get a 403 with CSRF error, clear token and retry once
    if (
      error.response?.status === 403 &&
      error.response?.data?.error?.includes("CSRF")
    ) {
      clearCsrfToken();

      // Retry the request once with a fresh token
      const originalRequest = error.config;
      if (!originalRequest._csrfRetry) {
        originalRequest._csrfRetry = true;
        await fetchCsrfToken();
        if (csrfToken) {
          originalRequest.headers[csrfHeaderName] = csrfToken;
        }
        return api(originalRequest);
      }
    }
    return Promise.reject(error);
  }
);

const coerceTimestamp = (value: string | number | Date): number => {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Date.now() : parsed;
};

const deserializeTimestamps = <T extends { createdAt: any; updatedAt: any }>(
  data: T
): T & { createdAt: number; updatedAt: number } => ({
  ...data,
  createdAt: coerceTimestamp(data.createdAt),
  updatedAt: coerceTimestamp(data.updatedAt),
});

const deserializeDrawingSummary = (drawing: any): DrawingSummary =>
  deserializeTimestamps(drawing);

const deserializeDrawing = (drawing: any): Drawing =>
  deserializeTimestamps(drawing);

export function getDrawings(
  search?: string,
  collectionId?: string | null
): Promise<DrawingSummary[]>;

export function getDrawings(
  search: string | undefined,
  collectionId: string | null | undefined,
  options: { includeData: true }
): Promise<Drawing[]>;

export async function getDrawings(
  search?: string,
  collectionId?: string | null,
  options?: { includeData?: boolean }
) {
  const params: any = {};
  if (search) params.search = search;
  if (collectionId !== undefined)
    params.collectionId = collectionId === null ? "null" : collectionId;
  if (options?.includeData) {
    params.includeData = "true";
    const response = await api.get<Drawing[]>("/drawings", { params });
    return response.data.map(deserializeDrawing);
  }
  const response = await api.get<DrawingSummary[]>("/drawings", { params });
  return response.data.map(deserializeDrawingSummary);
}

export const getDrawing = async (id: string) => {
  const response = await api.get<Drawing>(`/drawings/${id}`);
  return deserializeDrawing(response.data);
};

export const createDrawing = async (
  name?: string,
  collectionId?: string | null
) => {
  const response = await api.post<{ id: string }>("/drawings", {
    name,
    collectionId,
  });
  return response.data;
};

export const updateDrawing = async (id: string, data: Partial<Drawing>) => {
  const response = await api.put<{ success: true }>(`/drawings/${id}`, data);
  return response.data;
};

export const deleteDrawing = async (id: string) => {
  const response = await api.delete<{ success: true }>(`/drawings/${id}`);
  return response.data;
};

export const duplicateDrawing = async (id: string) => {
  const response = await api.post<Drawing>(`/drawings/${id}/duplicate`);
  return deserializeDrawing(response.data);
};

export const getCollections = async () => {
  const response = await api.get<Collection[]>("/collections");
  return response.data;
};

export const createCollection = async (name: string) => {
  const response = await api.post<Collection>("/collections", { name });
  return response.data;
};

export const updateCollection = async (id: string, name: string) => {
  const response = await api.put<{ success: true }>(`/collections/${id}`, {
    name,
  });
  return response.data;
};

export const deleteCollection = async (id: string) => {
  const response = await api.delete<{ success: true }>(`/collections/${id}`);
  return response.data;
};

// --- Library ---

export const getLibrary = async () => {
  const response = await api.get<{ items: any[] }>("/library");
  return response.data.items;
};

export const updateLibrary = async (items: any[]) => {
  const response = await api.put<{ items: any[] }>("/library", { items });
  return response.data.items;
};
