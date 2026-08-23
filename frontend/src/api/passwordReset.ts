import { API_URL, axios } from './client';

export const authPasswordResetCapability = async (): Promise<boolean> => {
  const response = await axios.get<{ enabled: boolean }>(
    `${API_URL}/auth/password-reset-capability`,
    { withCredentials: true },
  );
  return response.data.enabled;
};

export const authPasswordResetRequest = async (email: string): Promise<void> => {
  await axios.post(
    `${API_URL}/auth/password-reset-request`,
    { email },
    { withCredentials: true },
  );
};

export const authPasswordResetConfirm = async (
  token: string,
  password: string,
): Promise<void> => {
  await axios.post(
    `${API_URL}/auth/password-reset-confirm`,
    { token, password },
    { withCredentials: true },
  );
};
