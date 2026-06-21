-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN "authLoginRateLimitEnabled" BOOLEAN NOT NULL DEFAULT 1;
ALTER TABLE "SystemConfig" ADD COLUMN "authLoginRateLimitWindowMs" INTEGER NOT NULL DEFAULT 900000;
ALTER TABLE "SystemConfig" ADD COLUMN "authLoginRateLimitMax" INTEGER NOT NULL DEFAULT 20;

