import axios from "axios";
import type {
  Drawing,
  Collection,
  VaultStatus,
  VaultVerifyResult,
} from "../types";

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

// --- Private Vault ---

export const getVaultStatus = async (): Promise<VaultStatus> => {
  const response = await api.get<VaultStatus>("/vault/status");
  return response.data;
};

export const setupVault = async (
  passwordHash: string,
  salt: string,
  hint?: string
): Promise<void> => {
  await api.post("/vault/setup", { passwordHash, salt, hint });
};

export const verifyVaultPassword = async (
  password: string
): Promise<VaultVerifyResult> => {
  const response = await api.post<VaultVerifyResult>("/vault/verify", {
    password,
  });
  return response.data;
};

export const updateVaultHint = async (hint: string): Promise<void> => {
  await api.put("/vault/hint", { hint });
};

export const getVaultHint = async (): Promise<string | null> => {
  const response = await api.get<{ hint: string | null }>("/vault/hint");
  return response.data.hint;
};

export const changeVaultPassword = async (
  newPasswordHash: string,
  newSalt: string,
  _oldKey: CryptoKey,
  _newKey: CryptoKey
): Promise<void> => {
  // Note: The actual re-encryption of drawings happens client-side
  // This endpoint just updates the password hash and salt
  await api.put("/vault/password", {
    passwordHash: newPasswordHash,
    salt: newSalt,
  });
};

// --- Private Drawings ---

export const getPrivateDrawings = async (): Promise<Drawing[]> => {
  const response = await api.get<Drawing[]>("/drawings/private");
  return response.data.map(deserializeDrawing);
};

export const lockDrawing = async (
  id: string,
  encryptedData: string,
  iv: string
): Promise<void> => {
  await api.put(`/drawings/${id}/lock`, { encryptedData, iv });
};

export const lockDrawingWithPreview = async (
  id: string,
  encryptedData: string,
  iv: string,
  preview?: string
): Promise<void> => {
  const body: any = { encryptedData, iv };
  if (preview !== undefined) body.preview = preview;
  await api.put(`/drawings/${id}/lock`, body);
};

export const unlockDrawing = async (
  id: string,
  elements: any[],
  appState: any,
  files: any,
  preview?: string
): Promise<void> => {
  await api.put(`/drawings/${id}/unlock`, {
    elements,
    appState,
    files,
    preview,
  });
};
