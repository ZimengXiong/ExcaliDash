import axios from "axios";
import type { Drawing, Collection, SetupStatus, User } from "../types";

export const API_URL = import.meta.env.VITE_API_URL || "/api";

export const api = axios.create({
  baseURL: API_URL,
});

const coerceTimestamp = (value: string | number | Date): number => {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Date.now() : parsed;
};

const deserializeDrawing = (drawing: any): Drawing => ({
  ...drawing,
  createdAt: coerceTimestamp(drawing.createdAt),
  updatedAt: coerceTimestamp(drawing.updatedAt),
});

// --- Setup ---

export const getSetupStatus = async (): Promise<SetupStatus> => {
  const response = await api.get<SetupStatus>("/setup/status");
  return response.data;
};

export const createAdminAccount = async (data: {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}): Promise<{ user: User; token: string; expiresAt: string }> => {
  const response = await api.post("/setup/admin", data);
  return response.data;
};

// --- Drawings ---

export const getDrawings = async (
  search?: string,
  collectionId?: string | null
) => {
  const params: any = {};
  if (search) params.search = search;
  if (collectionId !== undefined)
    params.collectionId = collectionId === null ? "null" : collectionId;
  const response = await api.get<Drawing[]>("/drawings", { params });
  return response.data.map(deserializeDrawing);
};

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

// --- Collections ---

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
