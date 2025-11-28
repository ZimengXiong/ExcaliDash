export interface Drawing {
  id: string;
  name: string;
  elements: any[];
  appState: any;
  files: Record<string, any> | null;
  collectionId: string | null;
  updatedAt: number;
  createdAt: number;
  preview?: string;
  // Privacy/Encryption fields
  isPrivate?: boolean;
  encryptedData?: string | null;
  iv?: string | null;
}

export interface Collection {
  id: string;
  name: string;
  createdAt: number;
}

// Vault types
export interface VaultStatus {
  isSetup: boolean;
  salt?: string;
  hint?: string | null;
  privateDrawingsCount?: number;
}

export interface VaultVerifyResult {
  success: boolean;
  salt: string;
}
