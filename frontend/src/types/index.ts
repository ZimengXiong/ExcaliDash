export type DrawingAccessRole = "owner" | "editor" | "viewer";

export interface DrawingOwner {
  id: string;
  name: string;
  email?: string;
}

export interface DrawingSummary {
  id: string;
  name: string;
  collectionId: string | null;
  updatedAt: number;
  createdAt: number;
  version: number;
  preview?: string | null;
  accessRole?: DrawingAccessRole;
  owner?: DrawingOwner;
}

export interface Drawing extends DrawingSummary {
  elements: any[];
  appState: any;
  files: Record<string, any> | null;
}

export interface Collection {
  id: string;
  name: string;
  createdAt: number;
}
