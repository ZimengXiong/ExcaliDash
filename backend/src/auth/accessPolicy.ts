export const getEffectiveOidcJitProvisioning = (
  options: {
    oidcEnabled: boolean;
    defaultJitProvisioningEnabled: boolean;
  },
  systemConfig: {
    oidcJitProvisioningEnabled: boolean | null;
  }
): boolean => {
  if (!options.oidcEnabled) return false;
  return typeof systemConfig.oidcJitProvisioningEnabled === "boolean"
    ? systemConfig.oidcJitProvisioningEnabled
    : options.defaultJitProvisioningEnabled;
};

export const getEffectiveRegistrationEnabled = (
  authMode: "local" | "hybrid" | "oidc_enforced",
  registrationEnabled: boolean
): boolean => authMode !== "oidc_enforced" && registrationEnabled;
