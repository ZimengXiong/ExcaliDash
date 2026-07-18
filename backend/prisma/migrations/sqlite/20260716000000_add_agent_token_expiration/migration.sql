-- Account API keys remain non-expiring (NULL). Drawing-scoped agent tokens get
-- a bounded lifetime, including tokens created before this migration.
ALTER TABLE "ApiKey" ADD COLUMN "expiresAt" DATETIME;

UPDATE "ApiKey"
SET "expiresAt" = datetime("createdAt", '+30 days')
WHERE "drawingId" IS NOT NULL;
