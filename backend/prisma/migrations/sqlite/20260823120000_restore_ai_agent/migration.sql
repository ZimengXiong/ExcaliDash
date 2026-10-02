-- Restore the AI and drawing-agent schema after the 0.6.0 feature-removal migration.
-- This migration intentionally does not restore the tldraw Drawing.engine column.

ALTER TABLE "ApiKey" ADD COLUMN "drawingId" TEXT REFERENCES "Drawing" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ApiKey_drawingId_idx" ON "ApiKey"("drawingId");

ALTER TABLE "SystemConfig" ADD COLUMN "aiProvider" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN "aiBaseUrl" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN "aiModel" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN "aiApiKeyEncrypted" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN "aiChatgptEnabled" BOOLEAN;

CREATE TABLE "ChatGptConnection" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "expiresAt" BIGINT NOT NULL,
    "accountEmail" TEXT,
    "planType" TEXT,
    "needsReconnect" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChatGptConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ChatGptAuthState" (
    "state" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ChatGptAuthState_userId_idx" ON "ChatGptAuthState"("userId");
