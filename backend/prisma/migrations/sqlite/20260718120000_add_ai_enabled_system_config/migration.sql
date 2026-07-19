-- Global AI feature flag. Existing installations remain enabled.
ALTER TABLE "SystemConfig" ADD COLUMN "aiEnabled" BOOLEAN NOT NULL DEFAULT 1;
