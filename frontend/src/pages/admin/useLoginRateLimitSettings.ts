import { useBeforeUnload } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import * as api from "../../api";

type LoginRateLimitFormState = {
  enabled: boolean;
  windowMinutes: number;
  max: number;
};

const sanitizePositiveInt = (value: number, fallback = 1) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.round(value));
};

type UseLoginRateLimitSettingsParams = {
  authEnabled: boolean | null;
  isAdmin: boolean;
  oidcEnabled: boolean;
  setError: (message: string) => void;
  setSuccess: (message: string) => void;
};

export const useLoginRateLimitSettings = ({
  authEnabled,
  isAdmin,
  oidcEnabled,
  setError,
  setSuccess,
}: UseLoginRateLimitSettingsParams) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [windowMinutes, setWindowMinutes] = useState(15);
  const [maxAttempts, setMaxAttempts] = useState(20);
  const [savedConfig, setSavedConfig] =
    useState<LoginRateLimitFormState | null>(null);
  const [autoSaveQueued, setAutoSaveQueued] = useState(false);
  const lastAutoSaveAttemptKeyRef = useRef<string | null>(null);
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const normalizedConfig = useMemo<LoginRateLimitFormState>(
    () => ({
      enabled,
      windowMinutes: sanitizePositiveInt(windowMinutes),
      max: sanitizePositiveInt(maxAttempts),
    }),
    [enabled, windowMinutes, maxAttempts],
  );

  const dirty = Boolean(
    savedConfig &&
    (savedConfig.enabled !== normalizedConfig.enabled ||
      savedConfig.windowMinutes !== normalizedConfig.windowMinutes ||
      savedConfig.max !== normalizedConfig.max),
  );
  const hasPendingChanges = dirty || saving || autoSaveQueued;
  const normalizedConfigKey = `${normalizedConfig.enabled}:${normalizedConfig.windowMinutes}:${normalizedConfig.max}`;

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError("");
    setSavedConfig(null);
    setAutoSaveQueued(false);
    lastAutoSaveAttemptKeyRef.current = null;
    try {
      const response = await api.api.get<{
        config: { enabled: boolean; windowMs: number; max: number };
      }>("/auth/rate-limit/login");
      const cfg = response.data.config;
      const nextConfig: LoginRateLimitFormState = {
        enabled: Boolean(cfg.enabled),
        windowMinutes: sanitizePositiveInt(Number(cfg.windowMs) / 60000),
        max: sanitizePositiveInt(Number(cfg.max)),
      };
      setEnabled(nextConfig.enabled);
      setWindowMinutes(nextConfig.windowMinutes);
      setMaxAttempts(nextConfig.max);
      setSavedConfig(nextConfig);
    } catch (err: unknown) {
      let message = "Failed to load rate limit config";
      if (api.isAxiosError(err)) {
        message =
          err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [setError]);

  const saveConfig = useCallback(async () => {
    if (saving) return false;
    setSaving(true);
    setError("");
    try {
      const payload = {
        enabled: normalizedConfig.enabled,
        windowMs: Math.max(
          10_000,
          Math.round(normalizedConfig.windowMinutes * 60_000),
        ),
        max: sanitizePositiveInt(normalizedConfig.max),
      };
      const response = await api.api.put<{
        config: { enabled: boolean; windowMs: number; max: number };
      }>("/auth/rate-limit/login", payload);
      const cfg = response.data.config;
      const nextConfig: LoginRateLimitFormState = {
        enabled: Boolean(cfg.enabled),
        windowMinutes: sanitizePositiveInt(Number(cfg.windowMs) / 60000),
        max: sanitizePositiveInt(Number(cfg.max)),
      };
      setEnabled(nextConfig.enabled);
      setWindowMinutes(nextConfig.windowMinutes);
      setMaxAttempts(nextConfig.max);
      setSavedConfig(nextConfig);
      setAutoSaveQueued(false);
      toast.success("Login rate limit changes saved");
      return true;
    } catch (err: unknown) {
      let message = "Failed to save rate limit config";
      if (api.isAxiosError(err)) {
        message =
          err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [saving, normalizedConfig, setError]);

  const reset = useCallback(async () => {
    const identifier = resetIdentifier.trim();
    if (!identifier) {
      setError("Enter an email/username to reset");
      return;
    }
    setResetLoading(true);
    setError("");
    setSuccess("");
    try {
      await api.api.post("/auth/rate-limit/login/reset", { identifier });
      setSuccess(`Reset login rate limit for ${identifier}`);
      setResetIdentifier("");
    } catch (err: unknown) {
      let message = "Failed to reset rate limit";
      if (api.isAxiosError(err)) {
        message =
          err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    } finally {
      setResetLoading(false);
    }
  }, [resetIdentifier, setError, setSuccess]);

  useEffect(() => {
    if (!authEnabled || !isAdmin || !oidcEnabled) return;
    void loadConfig();
  }, [authEnabled, isAdmin, oidcEnabled, loadConfig]);

  useEffect(() => {
    if (!authEnabled || !isAdmin || !oidcEnabled) return;
    if (!savedConfig || !dirty || saving) return;
    if (lastAutoSaveAttemptKeyRef.current === normalizedConfigKey) return;
    setAutoSaveQueued(true);
    const timeoutId = window.setTimeout(() => {
      setAutoSaveQueued(false);
      const attemptedKey = normalizedConfigKey;
      void saveConfig().then((saved) => {
        lastAutoSaveAttemptKeyRef.current = saved ? attemptedKey : null;
      });
    }, 900);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    authEnabled,
    isAdmin,
    oidcEnabled,
    savedConfig,
    dirty,
    saving,
    normalizedConfigKey,
    saveConfig,
  ]);

  useEffect(() => {
    if (!dirty) {
      setAutoSaveQueued(false);
      lastAutoSaveAttemptKeyRef.current = null;
    }
  }, [dirty]);

  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (!hasPendingChanges) return;
        event.preventDefault();
        event.returnValue = "";
      },
      [hasPendingChanges],
    ),
  );

  return {
    loading,
    saving,
    autoSaveQueued,
    dirty,
    enabled,
    windowMinutes,
    maxAttempts,
    resetIdentifier,
    resetLoading,
    loadConfig,
    setEnabled,
    setWindowMinutes,
    setMaxAttempts,
    setResetIdentifier,
    reset,
  };
};
