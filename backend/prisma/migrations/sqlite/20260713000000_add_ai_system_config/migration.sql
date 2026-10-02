-- AI chat-proxy runtime settings, admin-editable on SystemConfig. The provider,
-- base URL, and model are non-secret overrides; the API key, if set via the
-- admin UI, is stored AES-256-GCM encrypted (an env-provided key always wins).
ALTER TABLE "SystemConfig" ADD COLUMN "aiProvider" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN "aiBaseUrl" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN "aiModel" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN "aiApiKeyEncrypted" TEXT;
