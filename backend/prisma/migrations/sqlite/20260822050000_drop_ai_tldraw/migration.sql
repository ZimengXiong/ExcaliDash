-- Defer/remove the experimental AI and tldraw features before beta:
-- drop their schema artifacts. Data is intentionally discarded; these
-- features never shipped in a stable release.

DROP TABLE IF EXISTS "ChatGptAuthState";
DROP TABLE IF EXISTS "ChatGptConnection";

ALTER TABLE "SystemConfig" DROP COLUMN "aiProvider";
ALTER TABLE "SystemConfig" DROP COLUMN "aiBaseUrl";
ALTER TABLE "SystemConfig" DROP COLUMN "aiModel";
ALTER TABLE "SystemConfig" DROP COLUMN "aiApiKeyEncrypted";
ALTER TABLE "SystemConfig" DROP COLUMN "aiChatgptEnabled";

ALTER TABLE "Drawing" DROP COLUMN "engine";

DROP INDEX IF EXISTS "ApiKey_drawingId_idx";
ALTER TABLE "ApiKey" DROP COLUMN "drawingId";
