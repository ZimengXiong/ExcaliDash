export const getSocketUrl = () =>
  import.meta.env.VITE_API_URL === "/api"
    ? window.location.origin
    : import.meta.env.VITE_API_URL ||
      import.meta.env.VITE_DEV_BACKEND_URL ||
      "http://localhost:8000";

export const createDemandDrivenRafScheduler = (callback: () => void) => {
  let frameId: number | null = null;
  return {
    schedule: () => {
      if (frameId !== null) return;
      frameId = requestAnimationFrame(() => {
        frameId = null;
        callback();
      });
    },
    cancel: () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
    },
  };
};
