-- CreateTable
CREATE TABLE "PrivateVault" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'vault',
    "passwordHash" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "hint" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Drawing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "elements" TEXT NOT NULL,
    "appState" TEXT NOT NULL,
    "files" TEXT NOT NULL DEFAULT '{}',
    "preview" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "collectionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "encryptedData" TEXT,
    "iv" TEXT,
    CONSTRAINT "Drawing_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Drawing" ("appState", "collectionId", "createdAt", "elements", "files", "id", "name", "preview", "updatedAt", "version") SELECT "appState", "collectionId", "createdAt", "elements", "files", "id", "name", "preview", "updatedAt", "version" FROM "Drawing";
DROP TABLE "Drawing";
ALTER TABLE "new_Drawing" RENAME TO "Drawing";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
