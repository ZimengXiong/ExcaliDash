import React from "react";
import * as api from "../../api";
import type { Collection } from "../../types";

type UseDashboardCollectionActionsParams = {
  selectedCollectionId: string | null | undefined;
  setSelectedCollectionId: (id: string | null | undefined) => void;
  setCollections: React.Dispatch<React.SetStateAction<Collection[]>>;
  refreshData: () => void;
};

export const useDashboardCollectionActions = ({
  selectedCollectionId,
  setSelectedCollectionId,
  setCollections,
  refreshData,
}: UseDashboardCollectionActionsParams) => {
  const handleCreateCollection = async (name: string) => {
    try {
      await api.createCollection(name);
      setCollections(await api.getCollections());
    } catch (err) {
      console.error("Failed to create collection:", err);
      refreshData();
    }
  };

  const handleEditCollection = async (id: string, name: string) => {
    setCollections((current) =>
      current.map((collection) =>
        collection.id === id ? { ...collection, name } : collection,
      ),
    );
    try {
      await api.updateCollection(id, name);
    } catch (err) {
      console.error("Failed to rename collection:", err);
      refreshData();
    }
  };

  const handleDeleteCollection = async (id: string) => {
    setCollections((current) =>
      current.filter((collection) => collection.id !== id),
    );
    if (selectedCollectionId === id) setSelectedCollectionId(undefined);
    try {
      await api.deleteCollection(id);
      refreshData();
    } catch (err) {
      console.error("Failed to delete collection:", err);
      refreshData();
    }
  };

  return {
    handleCreateCollection,
    handleEditCollection,
    handleDeleteCollection,
  };
};
