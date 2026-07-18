import type {
  Collection,
  CollectionShareRole,
  CollectionShareRow,
  CollectionShareUser,
} from "../types";
import { api } from "./client";

export type { CollectionShareRole, CollectionShareRow, CollectionShareUser };

export const getCollections = async () => {
  const response = await api.get<Collection[]>("/collections");
  return response.data;
};

export const createCollection = async (name: string) => {
  const response = await api.post<Collection>("/collections", { name });
  return response.data;
};

export const updateCollection = async (id: string, name: string) => {
  const response = await api.put<{ success: true }>(`/collections/${id}`, { name });
  return response.data;
};

export const deleteCollection = async (id: string) => {
  const response = await api.delete<{ success: true }>(`/collections/${id}`);
  return response.data;
};

export type LibraryItem = Record<string, unknown>;
export type LibrarySnapshot = { items: LibraryItem[]; version: number };

export const getLibrary = async (): Promise<LibrarySnapshot> => {
  const response = await api.get<LibrarySnapshot>("/library");
  return response.data;
};

export const updateLibrary = async (items: LibraryItem[], expectedVersion: number): Promise<LibrarySnapshot> => {
  const response = await api.put<LibrarySnapshot>("/library", { items, expectedVersion });
  return response.data;
};

export const getCollectionShares = async (
  collectionId: string,
): Promise<{ shares: CollectionShareRow[] }> => {
  const response = await api.get<{ shares: CollectionShareRow[] }>(
    `/collections/${collectionId}/shares`,
  );
  return response.data;
};

export const resolveCollectionShareUsers = async (
  collectionId: string,
  q: string,
): Promise<CollectionShareUser[]> => {
  const response = await api.get<{ users: CollectionShareUser[] }>(
    `/collections/${collectionId}/share-resolve`,
    { params: { q } },
  );
  return response.data.users;
};

export const addCollectionShare = async (
  collectionId: string,
  identifier: string,
  role: CollectionShareRole,
): Promise<{ share: CollectionShareRow }> => {
  const response = await api.post<{ share: CollectionShareRow }>(
    `/collections/${collectionId}/shares`,
    { identifier, role },
  );
  return response.data;
};

export const updateCollectionShare = async (
  collectionId: string,
  userId: string,
  role: CollectionShareRole,
): Promise<{ success: true }> => {
  const response = await api.patch<{ success: true }>(
    `/collections/${collectionId}/shares/${userId}`,
    { role },
  );
  return response.data;
};

export const removeCollectionShare = async (
  collectionId: string,
  userId: string,
): Promise<{ success: true }> => {
  const response = await api.delete<{ success: true }>(
    `/collections/${collectionId}/shares/${userId}`,
  );
  return response.data;
};
