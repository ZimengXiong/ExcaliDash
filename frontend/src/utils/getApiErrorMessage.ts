import { isAxiosError } from "../api/client";

export const getApiErrorMessage = (error: unknown, fallback: string): string => {
  if (isAxiosError(error)) {
    const data = error.response?.data;
    if (data && typeof data === "object") {
      const payload = data as { message?: unknown; error?: unknown };
      if (typeof payload.message === "string") return payload.message;
      if (typeof payload.error === "string") return payload.error;
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
};
