-- Track whether initial auth mode choice has been explicitly completed.
ALTER TABLE "SystemConfig" ADD COLUMN "authOnboardingCompleted" BOOLEAN NOT NULL DEFAULT false;
