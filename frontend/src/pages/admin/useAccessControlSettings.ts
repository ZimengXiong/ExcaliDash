import { useCallback, useState } from "react";
import * as api from "../../api";
import { useLocale } from "../../context/useLocale";

export const useAccessControlSettings = (
  isAdmin: boolean,
  setError: (message: string) => void,
  setSuccess: (message: string) => void,
) => {
  const { t } = useLocale();
  const [registrationEnabled, setRegistrationEnabled] = useState<
    boolean | null
  >(null);
  const [localRegistrationAllowed, setLocalRegistrationAllowed] =
    useState(true);
  const [oidcEnabled, setOidcEnabled] = useState(false);
  const [oidcJitProvisioningEnabled, setOidcJitProvisioningEnabled] = useState<
    boolean | null
  >(null);
  const [oidcProviderName, setOidcProviderName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.api.get<{
        registrationEnabled: boolean;
        authMode?: "local" | "hybrid" | "oidc_enforced";
        oidcEnabled?: boolean;
        oidcProvider?: string;
        oidcJitProvisioningEnabled?: boolean;
      }>("/auth/status");
      setRegistrationEnabled(Boolean(response.data.registrationEnabled));
      setLocalRegistrationAllowed(response.data.authMode !== "oidc_enforced");
      setOidcEnabled(Boolean(response.data.oidcEnabled));
      setOidcProviderName(
        typeof response.data.oidcProvider === "string"
          ? response.data.oidcProvider
          : null,
      );
      setOidcJitProvisioningEnabled(
        typeof response.data.oidcJitProvisioningEnabled === "boolean"
          ? response.data.oidcJitProvisioningEnabled
          : null,
      );
    } catch (err: unknown) {
      let message = t("admin.access.errors.load");
      if (api.isAxiosError(err)) {
        message =
          err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [setError, t]);

  const toggleRegistration = async () => {
    if (!isAdmin || registrationEnabled === null || !localRegistrationAllowed)
      return;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const response = await api.api.post<{ registrationEnabled: boolean }>(
        "/auth/registration/toggle",
        { enabled: !registrationEnabled },
      );
      setRegistrationEnabled(Boolean(response.data.registrationEnabled));
      setSuccess(
        response.data.registrationEnabled
          ? t("admin.access.registrationEnabled")
          : t("admin.access.registrationDisabled"),
      );
    } catch (err: unknown) {
      let message = t("admin.access.errors.updateRegistration");
      if (api.isAxiosError(err)) {
        message =
          err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const toggleOidcJitProvisioning = async () => {
    if (!isAdmin || !oidcEnabled || oidcJitProvisioningEnabled === null) return;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const response = await api.api.post<{
        oidcJitProvisioningEnabled: boolean;
      }>("/auth/oidc/jit-provisioning", {
        enabled: !oidcJitProvisioningEnabled,
      });
      setOidcJitProvisioningEnabled(
        Boolean(response.data.oidcJitProvisioningEnabled),
      );
      setSuccess(
        response.data.oidcJitProvisioningEnabled
          ? t("admin.access.autoProvisioningEnabled")
          : t("admin.access.autoProvisioningDisabled"),
      );
    } catch (err: unknown) {
      let message = t("admin.access.errors.updateOidc");
      if (api.isAxiosError(err)) {
        message =
          err.response?.data?.message || err.response?.data?.error || message;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return {
    registrationEnabled,
    localRegistrationAllowed,
    oidcEnabled,
    oidcJitProvisioningEnabled,
    oidcProviderName,
    loading,
    load,
    toggleRegistration,
    toggleOidcJitProvisioning,
  };
};
