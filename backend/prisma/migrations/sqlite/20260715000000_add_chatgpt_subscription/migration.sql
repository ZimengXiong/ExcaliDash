-- Per-user ChatGPT (Codex OAuth) subscription provider.
-- Admin kill-switch (null = enabled by default).
ALTER TABLE "SystemConfig" ADD COLUMN "aiChatgptEnabled" BOOLEAN;

-- Per-user connection: OAuth tokens billed to the user's own ChatGPT plan,
-- encrypted at rest (AES-256-GCM). Never sent to the browser.
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

-- Short-lived pending OAuth authorizations (PKCE verifier + CSRF state).
CREATE TABLE "ChatGptAuthState" (
    "state" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ChatGptAuthState_userId_idx" ON "ChatGptAuthState"("userId");
