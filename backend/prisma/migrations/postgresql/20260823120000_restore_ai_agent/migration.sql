-- Restore the AI and drawing-agent schema after the 0.6.0 feature-removal migration.
-- This migration intentionally does not restore the tldraw Drawing.engine column.

ALTER TABLE "ApiKey" ADD COLUMN "drawingId" TEXT;
CREATE INDEX "ApiKey_drawingId_idx" ON "ApiKey"("drawingId");
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "Drawing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SystemConfig" ADD COLUMN "aiProvider" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN "aiBaseUrl" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN "aiModel" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN "aiApiKeyEncrypted" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN "aiChatgptEnabled" BOOLEAN;

CREATE TABLE "ChatGptConnection" (
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "expiresAt" BIGINT NOT NULL,
    "accountEmail" TEXT,
    "planType" TEXT,
    "needsReconnect" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatGptConnection_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "ChatGptConnection" ADD CONSTRAINT "ChatGptConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChatGptAuthState" (
    "state" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatGptAuthState_pkey" PRIMARY KEY ("state")
);
CREATE INDEX "ChatGptAuthState_userId_idx" ON "ChatGptAuthState"("userId");
