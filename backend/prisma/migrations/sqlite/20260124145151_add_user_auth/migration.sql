-- NOTE:
-- This migration assigns all pre-existing data to a bootstrap admin user so that
-- upgrading an existing (non-empty) database doesn't fail and the data remains accessible.
-- The bootstrap admin user starts inactive and must be activated via the app's
-- initial registration flow.

-- Constants
-- Keep in sync with backend/src/auth.ts
-- (SQLite doesn't support variables; we inline the values instead.)
--   BOOTSTRAP_USER_ID = 'bootstrap-admin'
--   BOOTSTRAP_LIBRARY_ID = 'user_bootstrap-admin'

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "mustResetPassword" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "registrationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Bootstrap state:
-- - Insert a singleton config row (registration disabled by default)
-- - Insert an inactive bootstrap admin user and assign all existing data to it
INSERT INTO "SystemConfig" ("id", "registrationEnabled", "createdAt", "updatedAt")
VALUES ('default', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "User" ("id", "username", "email", "passwordHash", "name", "role", "mustResetPassword", "isActive", "createdAt", "updatedAt")
VALUES ('bootstrap-admin', NULL, 'bootstrap@excalidash.local', '', 'Bootstrap Admin', 'ADMIN', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Collection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Collection" ("createdAt", "id", "name", "userId", "updatedAt")
SELECT "createdAt", "id", "name", 'bootstrap-admin', "updatedAt" FROM "Collection";
DROP TABLE "Collection";
ALTER TABLE "new_Collection" RENAME TO "Collection";
CREATE TABLE "new_Drawing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "elements" TEXT NOT NULL,
    "appState" TEXT NOT NULL,
    "files" TEXT NOT NULL DEFAULT '{}',
    "preview" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "userId" TEXT NOT NULL,
    "collectionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Drawing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Drawing_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Drawing" ("appState", "collectionId", "createdAt", "elements", "files", "id", "name", "preview", "userId", "updatedAt", "version")
SELECT "appState", "collectionId", "createdAt", "elements", "files", "id", "name", "preview", 'bootstrap-admin', "updatedAt", "version" FROM "Drawing";
DROP TABLE "Drawing";
ALTER TABLE "new_Drawing" RENAME TO "Drawing";
CREATE TABLE "new_Library" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "items" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
-- Migrate the singleton library to the bootstrap user's library key.
INSERT INTO "new_Library" ("createdAt", "id", "items", "updatedAt")
SELECT "createdAt", 'user_bootstrap-admin', "items", "updatedAt" FROM "Library" WHERE "id" = 'default';
DROP TABLE "Library";
ALTER TABLE "new_Library" RENAME TO "Library";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
