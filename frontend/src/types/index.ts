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
}

export interface Collection {
  id: string;
  name: string;
  createdAt: number;
}

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  role: 'ADMIN' | 'USER';
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
  _count?: {
    drawings: number;
    collections: number;
  };
}

export interface AdminUser extends User {
  _count: {
    drawings: number;
    collections: number;
    sessions: number;
  };
}

export interface AdminStats {
  users: {
    total: number;
    active: number;
    inactive: number;
  };
  content: {
    drawings: number;
    collections: number;
  };
  sessions: {
    active: number;
  };
  recentUsers: {
    id: string;
    email: string;
    displayName: string | null;
    createdAt: string;
  }[];
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface SetupStatus {
  needsSetup: boolean;
  message: string;
}
