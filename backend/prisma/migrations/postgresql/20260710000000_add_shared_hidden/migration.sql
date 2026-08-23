-- Per-recipient hidden flag so a grantee can hide a shared drawing from their
-- own "Shared with me" list without affecting the owner or other recipients.
ALTER TABLE "DrawingPermission" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;
