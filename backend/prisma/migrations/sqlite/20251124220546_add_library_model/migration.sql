-- CreateTable
CREATE TABLE "Library" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "items" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
