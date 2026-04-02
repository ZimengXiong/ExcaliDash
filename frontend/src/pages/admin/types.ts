export type AdminUser = {
  id: string;
  username: string | null;
  email: string;
  name: string;
  role: 'ADMIN' | 'USER' | string;
  mustResetPassword: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
