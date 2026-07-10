<!-- GENERATED FILE — edit backend/src/config/registry/* and run npm run gen:env -->

# Configuration Reference

All backend environment variables are declared once in `backend/src/config/registry/`.
This file and `backend/.env.example` are generated from that registry; do not edit them by hand.

## Server

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `PORT` | `8000` | No | TCP port the backend HTTP server listens on. |
| `NODE_ENV` | `development` | No | Runtime environment; production enables extra validation and hardening. Allowed: development, production, test. |
| `FRONTEND_URL` | — | No | Comma-separated CORS allowlist of frontend origins; also drives HTTPS detection. |
| `TRUST_PROXY` | `false` | No | Express trust proxy setting: true, false, or a positive hop count. |
| `DRAWINGS_CACHE_TTL_MS` | `5000` | No | In-memory drawings list cache TTL in milliseconds. |
| `SNAPSHOT_RETENTION_DAYS` | `2` | No | Number of days to retain drawing snapshots before the hourly sweep prunes them. |
| `UPLOAD_MAX_MB` | `100` | No | Maximum size (in MB) of a single uploaded file accepted by multer (imports, database restores). |
| `BODY_LIMIT_MB` | `50` | No | Maximum request body size (in MB) for scene JSON/urlencoded payloads and the Socket.IO buffer; images no longer travel in the scene body (see FILE_UPLOAD_MAX_MB), so this bounds scene JSON only. |
| `FILE_UPLOAD_MAX_MB` | `100` | No | Maximum size (in MB) of a single image accepted by the raw file-upload endpoint (PUT /api/drawings/:id/files/:fileId); the only per-image cap. |

## Database

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | `file:<backend>/prisma/dev.db` | No | Prisma database connection string; file: paths are normalized against prisma/. |
| `DATABASE_PROVIDER` | `sqlite` | No | Prisma datasource provider selected by the docker entrypoint. Allowed: sqlite, postgresql. Consumed outside the backend; documented only. |
| `RUN_MIGRATIONS` | — | No | Whether the docker entrypoint applies pending migrations on startup. Consumed outside the backend; documented only. |
| `MIGRATION_LOCK_TIMEOUT_SECONDS` | — | No | Advisory-lock timeout (seconds) used by the migration entrypoint. Consumed outside the backend; documented only. |

## Authentication

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `AUTH_MODE` | `local` | No | Authentication mode: local credentials, hybrid, OIDC-enforced, or disabled (no login; every request runs as a single shared local user — do not expose such an instance to untrusted networks). Allowed: local, hybrid, oidc_enforced, disabled. |
| `JWT_SECRET` | _(none — secret)_ | In production | Secret used to sign JWTs; an ephemeral random secret is generated in dev when unset. |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | No | Access-token lifetime (vercel/ms style duration). |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | No | Refresh-token lifetime (vercel/ms style duration). |
| `ENABLE_PASSWORD_RESET` | `false` | No | Enable the password-reset flow. |
| `ENABLE_REFRESH_TOKEN_ROTATION` | `true` | No | Rotate refresh tokens on each successful refresh. |
| `ENABLE_AUDIT_LOGGING` | `false` | No | Write authentication/authorization audit-log entries. |
| `DISABLE_ONBOARDING_GATE` | `false` | No | Disable the first-run onboarding gate in local-mode production. |
| `BOOTSTRAP_SETUP_CODE_TTL_MS` | `900000` | No | Lifetime (ms) of the initial admin bootstrap setup code. |
| `BOOTSTRAP_SETUP_CODE_MAX_ATTEMPTS` | `10` | No | Maximum verification attempts for the bootstrap setup code. |
| `PASSWORD_MIN_LENGTH` | `12` | No | Minimum accepted password length. |
| `PASSWORD_MAX_LENGTH` | `100` | No | Maximum accepted password length. |
| `PASSWORD_REQUIRE_UPPERCASE` | `true` | No | Require at least one uppercase letter in passwords. |
| `PASSWORD_REQUIRE_LOWERCASE` | `true` | No | Require at least one lowercase letter in passwords. |
| `PASSWORD_REQUIRE_NUMBER` | `true` | No | Require at least one number in passwords. |
| `PASSWORD_REQUIRE_SYMBOL` | `true` | No | Require at least one symbol in passwords. |

## OIDC

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `OIDC_ISSUER_URL` | — | When OIDC enabled | OIDC issuer (provider) base URL. |
| `OIDC_CLIENT_ID` | — | When OIDC enabled | OIDC client identifier. |
| `OIDC_REDIRECT_URI` | — | When OIDC enabled | OIDC redirect URI; must be HTTPS in production. |
| `OIDC_DISCOVERY_URL` | — | No | Explicit OIDC discovery document URL (overrides issuer-derived path). |
| `OIDC_CLIENT_SECRET` | _(none — secret)_ | No | OIDC client secret for confidential clients. |
| `OIDC_PROVIDER_NAME` | `OIDC` | No | Display name of the OIDC provider shown in the UI. |
| `OIDC_SCOPES` | `openid profile email` | No | Space-separated OIDC scopes requested during login. |
| `OIDC_EMAIL_CLAIM` | `email` | No | ID-token claim to read the user email from. |
| `OIDC_EMAIL_VERIFIED_CLAIM` | `email_verified` | No | ID-token claim indicating whether the email is verified. |
| `OIDC_GROUPS_CLAIM` | `groups` | No | ID-token claim (key or path) carrying the user's groups. |
| `OIDC_ADMIN_GROUPS` | — | No | Comma-separated groups whose members are granted admin. |
| `OIDC_REQUIRE_EMAIL_VERIFIED` | `true` | No | Reject logins whose email is not marked verified. |
| `OIDC_JIT_PROVISIONING` | `true` | No | Just-in-time provision users on first successful OIDC login. |
| `OIDC_FIRST_USER_ADMIN` | `true` | No | Grant admin to the first user provisioned via OIDC. |
| `OIDC_ID_TOKEN_SIGNED_RESPONSE_ALG` | — | No | Expected signing algorithm for the ID token. Allowed: RS256, RS384, RS512, PS256, PS384, PS512, ES256, ES384, ES512, EdDSA, HS256, HS384, HS512. |
| `OIDC_TOKEN_ENDPOINT_AUTH_METHOD` | — | No | Client authentication method used at the token endpoint. Allowed: none, client_secret_basic, client_secret_post. |

## Security

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `CSRF_SECRET` | _(none — secret)_ | In production | Secret used to sign CSRF tokens; a dev fallback is derived when unset. |
| `CSRF_MAX_REQUESTS` | `60` | No | Maximum CSRF-token issuances per rate-limit window. |
| `RATE_LIMIT_MAX_REQUESTS` | `1000` | No | Maximum general API requests per rate-limit window. |
| `RATE_LIMIT_WINDOW_MS` | `900000` | No | General API rate-limit window in milliseconds (default 15 minutes); pairs with RATE_LIMIT_MAX_REQUESTS. |
| `CSRF_RATE_LIMIT_WINDOW_MS` | `60000` | No | CSRF-token issuance rate-limit window in milliseconds (default 1 minute); pairs with CSRF_MAX_REQUESTS. |
| `AGENT_OPS_RATE_LIMIT_MAX` | `120` | No | Maximum agent ops-batch requests (POST /api/drawings/:id/ops) per key/user per window. |
| `AGENT_OPS_RATE_LIMIT_WINDOW_MS` | `60000` | No | Agent ops-batch rate-limit window in milliseconds (default 1 minute); pairs with AGENT_OPS_RATE_LIMIT_MAX. |
| `ENFORCE_HTTPS_REDIRECT` | `true` | No | Redirect HTTP requests to HTTPS when a secure origin is detected. |
| `API_KEY_HASH_PEPPER` | _(none — secret)_ | No | Pepper mixed into API-key hashes; set before creating keys (see docs). |
| `DEBUG_CSRF` | `false` | No | Enable verbose CSRF debug logging. |

## S3 storage

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `S3_BUCKET` | — | No | S3 bucket name; setting this enables S3-backed file storage. |
| `S3_REGION` | `us-east-1` | No | S3 region. |
| `S3_ENDPOINT` | — | No | Custom endpoint for S3-compatible services (MinIO, R2, etc.). |
| `S3_PUBLIC_URL` | — | No | Public base URL/CDN for objects; required for non-AWS endpoints. |
| `S3_FORCE_PATH_STYLE` | `false` | No | Force path-style addressing (required for MinIO). |
| `S3_KEY_PREFIX` | `excalidash` | No | Object-key prefix for stored files; trailing slashes are stripped. |
| `AWS_ACCESS_KEY_ID` | _(none — secret)_ | No | S3 access key ID; omit to use the ambient IAM credential chain. |
| `AWS_SECRET_ACCESS_KEY` | _(none — secret)_ | No | S3 secret access key; omit to use the ambient IAM credential chain. |

## Backups

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `BACKUP_SCHEDULE` | — | No | Cron expression for scheduled backups; unset disables scheduling. |
| `BACKUP_DIR` | `<backend>/backups` | No | Directory where database backups are written. |
| `BACKUP_RETENTION_DAYS` | `14` | No | Number of days to retain backups before pruning. |

## Update check

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `UPDATE_CHECK_OUTBOUND` | `true` | No | Allow outbound requests to GitHub to check for new releases. |
| `UPDATE_CHECK_GITHUB_TOKEN` | _(none — secret)_ | No | GitHub token used to raise the update-check API rate limit. Deprecated aliases: GITHUB_TOKEN. |

## Link sharing

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `LINK_SHARE_EDIT_DEFAULT_TTL_MS` | `604800000` | No | Default lifetime (ms) of edit share links (7 days). |
| `LINK_SHARE_VIEW_DEFAULT_TTL_MS` | `2592000000` | No | Default lifetime (ms) of view share links (30 days). |
| `LINK_SHARE_MAX_TTL_MS` | `7776000000` | No | Maximum allowed lifetime (ms) for any share link (90 days). |

## AI

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `AI_PROVIDER` | `disabled` | No | AI chat-proxy provider: disabled (chat panel hidden), anthropic (Messages API), openai (Chat Completions), or custom (any OpenAI-compatible baseUrl). The admin settings page can override this at runtime. Allowed: disabled, anthropic, openai, custom. |
| `AI_API_KEY` | _(none — secret)_ | No | Provider API key for the AI chat proxy. Server-side only — never shipped to the browser. An env-provided key always wins over a key stored via the admin settings page. |
| `AI_BASE_URL` | — | No | Override the provider base URL (e.g. an OpenAI-compatible gateway or self-hosted endpoint). Required for AI_PROVIDER=custom; optional otherwise. |
| `AI_MODEL` | — | No | Model id the chat proxy requests (e.g. claude-opus-4-8 for anthropic, gpt-4o for openai). Falls back to a provider default when unset. |
| `AI_MAX_TOKENS_PER_REQUEST` | `4096` | No | Maximum output tokens the chat proxy requests per model call. |
| `AI_RATE_LIMIT_MAX` | `60` | No | Maximum AI chat requests allowed per user within AI_RATE_LIMIT_WINDOW_MS. |
| `AI_RATE_LIMIT_WINDOW_MS` | `60000` | No | Rolling window (ms) for the AI chat per-user rate limiter. |

## Frontend (build-time)

| Variable | Default | Required | Description |
| --- | --- | --- | --- |
| `VITE_API_URL` | `/api` | No | Base URL the frontend uses to reach the backend API. Keep /api so requests stay same-origin (proxied by Vite in dev and nginx in production), avoiding CORS. Consumed outside the backend; documented only. |
| `VITE_EXCALIDASH_UI_FONT_FAMILY` | `Excalifont` | No | Optional app-shell display font family override. Falls back to Excalifont when unset. Consumed outside the backend; documented only. |
| `VITE_EXCALIDASH_UI_FONT_URL` | — | No | Optional self-hosted WOFF2 URL for the display font; when set, a matching @font-face is injected for VITE_EXCALIDASH_UI_FONT_FAMILY. Consumed outside the backend; documented only. |
