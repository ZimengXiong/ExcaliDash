-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN "bootstrapSetupCodeHash" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN "bootstrapSetupCodeIssuedAt" DATETIME;
ALTER TABLE "SystemConfig" ADD COLUMN "bootstrapSetupCodeExpiresAt" DATETIME;
ALTER TABLE "SystemConfig" ADD COLUMN "bootstrapSetupCodeFailedAttempts" INTEGER NOT NULL DEFAULT 0;
