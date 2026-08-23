export type ProductionValidationConfig = {
  jwtSecret: string;
  apiKeyHashPepper: string;
  oidc: {
    enabled: boolean;
    redirectUri: string | null;
  };
};

const DEFAULT_API_KEY_HASH_PEPPER = "api-key-hash-pepper";

export const validateProductionConfig = (config: ProductionValidationConfig): void => {
  if (config.apiKeyHashPepper === DEFAULT_API_KEY_HASH_PEPPER) {
    console.warn(
      "[security] API_KEY_HASH_PEPPER is using the built-in default value in production. " +
        "Set a unique API_KEY_HASH_PEPPER BEFORE creating any API keys; changing it later " +
        "invalidates all existing API keys.",
    );
  }

  const normalizedSecret = config.jwtSecret.trim();
  const insecureJwtSecretPlaceholders = new Set([
    "your-secret-key-change-in-production",
    "change-this-secret-in-production-min-32-chars",
  ]);

  if (config.jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters long in production");
  }
  if (insecureJwtSecretPlaceholders.has(normalizedSecret)) {
    throw new Error("JWT_SECRET must be changed from placeholder/default value in production");
  }
  if (config.oidc.enabled && config.oidc.redirectUri && !/^https:\/\//i.test(config.oidc.redirectUri)) {
    throw new Error("OIDC_REDIRECT_URI must be HTTPS in production");
  }
};
