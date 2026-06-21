-- Add authEnabled flag to SystemConfig to support single-user mode by default.

-- SQLite supports simple ADD COLUMN for non-null with default.
ALTER TABLE "SystemConfig" ADD COLUMN "authEnabled" BOOLEAN NOT NULL DEFAULT false;

