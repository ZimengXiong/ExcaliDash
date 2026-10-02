-- Add server-side per-user preferences for theme, dashboard sort, and future UI settings.
ALTER TABLE "User" ADD COLUMN "preferences" TEXT;
