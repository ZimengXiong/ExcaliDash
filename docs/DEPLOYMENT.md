# Advanced deployment and operations

<details>
<summary>Reverse Proxy / Traefik</summary>

When running ExcaliDash behind Traefik, Nginx, or another reverse proxy, configure both containers so that API + WebSocket calls resolve correctly:

| Variable                 | Purpose                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FRONTEND_URL`           | Backend allowed origin(s). Must match the public URL users access (for example `https://excalidash.example.com`). Supports comma-separated values for multiple addresses. |
| `TRUST_PROXY`            | Set to `1` when traffic passes through one trusted reverse-proxy hop (for example frontend nginx -> backend) and headers are sanitized.                                   |
| `BACKEND_URL`            | Frontend container-to-backend target used by Nginx. Override when backend host differs from default service DNS/host.                                                     |
| `ENFORCE_HTTPS_REDIRECT` | When `FRONTEND_URL` uses `https://`, the backend automatically redirects plain-HTTP requests to HTTPS. Set to `false` if your outer gateway already enforces HTTPS and you want to disable the built-in redirect (avoids redirect loops when `X-Forwarded-Proto` is not forwarded). Default: `true`. |

```yaml
# docker-compose.yml example
backend:
  environment:
    # Single URL
    - FRONTEND_URL=https://excalidash.example.com
    # Trust exactly one reverse-proxy hop
    - TRUST_PROXY=1
    # Or multiple URLs (comma-separated) for local + network access
    # - FRONTEND_URL=http://localhost:6767,http://192.168.1.100:6767,http://nas.local:6767
    # If your outer gateway enforces HTTPS and X-Forwarded-Proto is not forwarded,
    # disable the built-in redirect to prevent redirect loops:
    # - ENFORCE_HTTPS_REDIRECT=false
frontend:
  environment:
    # For standard Docker Compose (default)
    # - BACKEND_URL=backend:8000
    # For Kubernetes, use the service DNS name:
    - BACKEND_URL=excalidash-backend.default.svc.cluster.local:8000
```

</details>

<details>
<summary>Scaling / HA (Current Limitations)</summary>

ExcaliDash currently supports running **one backend instance**.

Why:

| Area          | Limitation                                                                                                                                                                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database      | The backend uses a local **SQLite file** database by default (`DATABASE_URL=file:/.../dev.db`). Running multiple backend replicas either creates split-brain state (separate DB files/volumes) or requires sharing a single SQLite file across hosts, which is not a reliable deployment pattern. |
| Collaboration | Real-time presence state is tracked **in-memory** in the backend process, so multiple replicas will fragment presence/collaboration unless a shared Socket.IO adapter is added.                                                                                                                   |

Recommended deployment pattern:

| Component | Guidance                                                                |
| --------- | ----------------------------------------------------------------------- |
| Backend   | 1 replica, persistent volume, regular backups.                          |
| Frontend  | 1 replica is simplest; scaling is generally fine since it is stateless. |

</details>

<details>
<summary>Auth, Onboarding, and First Admin Setup</summary>

ExcaliDash supports local login and OIDC, and includes a one-time first-admin bootstrap key to protect initial setup/migration flows.

Auth modes:

| `AUTH_MODE`       | Behavior                                                       |
| ----------------- | -------------------------------------------------------------- |
| `local` (default) | Native email/password login only.                              |
| `hybrid`          | Native login plus OIDC login.                                  |
| `oidc_enforced`   | OIDC-only login (`/auth/register` and `/auth/login` disabled). |

If you upgrade and see an onboarding/setup flow, follow the UI. For emergency-only operator access, you can temporarily bypass the onboarding gate:

```bash
DISABLE_ONBOARDING_GATE=true docker compose -f docker-compose.prod.yml up -d
```

One-time first-admin bootstrap setup code (local auth only):

| What             | Notes                                                                                |
| ---------------- | ------------------------------------------------------------------------------------ |
| When required    | Auth enabled and no active users (fresh install or certain migrations).              |
| Where to find it | Backend logs: `[BOOTSTRAP SETUP] One-time admin setup code ...`.                     |
| Behavior         | Single-use; if you enter an invalid/expired code, check logs for the refreshed code. |

Find the current code in logs:

```bash
docker compose -f docker-compose.prod.yml logs backend --tail=200 | grep "BOOTSTRAP SETUP"
```

OIDC configuration (for `hybrid` / `oidc_enforced`) requires these backend env vars:

```yaml
backend:
  environment:
    - AUTH_MODE=oidc_enforced
    - OIDC_PROVIDER_NAME=Authentik
    - OIDC_ISSUER_URL=https://auth.example.com/application/o/excalidash/
    # Split-horizon: keep OIDC_ISSUER_URL browser-routable and set OIDC_DISCOVERY_URL
    # (see notes below) when the backend reaches the IdP via internal DNS.
    - OIDC_CLIENT_ID=your-client-id
    # Optional for public clients; required for confidential clients
    # - OIDC_CLIENT_SECRET=your-client-secret
    # Optional token endpoint auth override (useful for some IdPs/HS setups)
    # - OIDC_TOKEN_ENDPOINT_AUTH_METHOD=client_secret_post
    # Optional override when your IdP client is configured for a non-default ID token alg
    # - OIDC_ID_TOKEN_SIGNED_RESPONSE_ALG=HS256
    - OIDC_REDIRECT_URI=https://excalidash.example.com/api/auth/oidc/callback
    - OIDC_SCOPES=openid profile email
    # Optional: path to groups/roles claim in ID token/user claims (supports dot path)
    - OIDC_GROUPS_CLAIM=groups
    # Optional: comma-separated group names that should be ADMIN in ExcaliDash
    - OIDC_ADMIN_GROUPS=excalidash-admins,platform-admins
```

Quick preflight check (recommended before starting backend):

```bash
cd backend
npm run oidc:doctor
```

Provider-specific env templates for existing IdPs:

- `backend/.env.oidc.keycloak.example`
- `backend/.env.oidc.authentik.example`

Copy one to `backend/.env`, update issuer/client/redirect values, then run `npm run oidc:doctor`.

Notes:

| Topic                        | Notes                                                                                                                                                                                                                                                                                                                                 |
|------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| OIDC-only (`oidc_enforced`)  | You typically do not use local bootstrap admin registration; first admin can be created through your IdP depending on config.                                                                                                                                                                                                         |
| ID token algorithm           | ExcaliDash defaults to `RS256`. If your IdP client is explicitly configured for another signed ID-token algorithm such as `HS256`, set `OIDC_ID_TOKEN_SIGNED_RESPONSE_ALG` to match that exact client setting. `none` is not allowed, and `HS*` requires `OIDC_CLIENT_SECRET`.                                                        |
| Keycloak issuer format       | Use realm issuer URL: `https://<keycloak-host>/realms/<realm>`.                                                                                                                                                                                                                                                                       |
| Authentik issuer format      | Use provider issuer URL: `https://<authentik-host>/application/o/<provider-slug>/`.                                                                                                                                                                                                                                                   |
| Authentik `email_verified`   | If Authentik does not emit `email_verified=true`, either add the scope mapping or set `OIDC_REQUIRE_EMAIL_VERIFIED=false`.                                                                                                                                                                                                            |
| Microsoft Entra `email_verified` | Entra ID often omits `email_verified`. Either add a claim mapping policy that emits `email_verified=true` for your service principal, or set `OIDC_REQUIRE_EMAIL_VERIFIED=false` for trusted internal deployments. |
| Redirect URI                 | Must be exact callback: `https://<excalidash-host>/api/auth/oidc/callback`.                                                                                                                                                                                                                                                           |
| OIDC admin mapping           | If `OIDC_ADMIN_GROUPS` is set, admin role is reconciled on each authenticated request for OIDC users: users in those groups are promoted to `ADMIN`, users not in those groups are demoted to `USER`.                                                                                                                                 |
| Legacy sessions              | Users with old sessions (issued before group claims were embedded) should sign out/in once so OIDC group claims are refreshed.                                                                                                                                                                                                        |
| OIDC_DISCOVERY_URL           | In Docker Compose or Kubernetes the backend container may not be able to reach your IdP's public hostname. Set `OIDC_DISCOVERY_URL` to an internal URL so the backend can fetch `.well-known/openid-configuration` without changing `OIDC_ISSUER_URL`, which must stay as the public URL for issuer validation and browser redirects. |

</details>

<details>
<summary>Local OIDC Test Stack (Docker + Keycloak)</summary>

This repo includes a Keycloak container + realm seed for local OIDC testing:

- Compose file: `docker-compose.oidc.yml`
- Realm import: `oidc/keycloak/realm-excalidash.json`

The realm seed intentionally contains **no users and no passwords**. You create a realm user and set a password via the Keycloak admin UI.

Start Keycloak:

```bash
# From repo root
# Choose a strong password; do not commit it.
export KEYCLOAK_ADMIN_PASSWORD='...'
docker compose -f docker-compose.oidc.yml up -d
```

Open Keycloak admin UI (realm/user setup):

- `http://localhost:8080/admin`
- Switch realm to `excalidash`
- Create a user and set a password in `Credentials`

Configure ExcaliDash backend for hybrid OIDC:

```bash
cd backend
cp .env.oidc.example .env
# If backend runs in Docker and Keycloak issuer is localhost for browser, set:
# OIDC_DISCOVERY_URL=http://keycloak:8080/realms/excalidash
# Ensure OIDC_REDIRECT_URI matches where your frontend is running:
# - http://localhost:6767/api/auth/oidc/callback (repo frontend dev default)
# - https://excalidash.example.com/api/auth/oidc/callback (production)
```

Stop/clean up:

```bash
docker compose -f docker-compose.oidc.yml down
```

</details>

<details>
<summary>Configuration (Backend Environment Variables)</summary>

Base values are documented in `backend/.env.example`. Common ones to care about:

| Variable                 | Default / Example         | Description                                                                         |
| ------------------------ | ------------------------- | ----------------------------------------------------------------------------------- |
| `DATABASE_PROVIDER`      | `sqlite`                  | Database provider: `sqlite` or `postgresql`. See Database provider below.           |
| `DATABASE_URL`           | `file:/app/prisma/dev.db` | SQLite file or external DB URL.                                                     |
| `FRONTEND_URL`           | `http://localhost:6767`   | Allowed frontend origin(s), comma-separated for multiple entries.                   |
| `TRUST_PROXY`            | `false`                   | `false`, `true`, or hop count (for example `1`).                                    |
| `JWT_SECRET`             | `change-this-secret...`   | Recommended in production so sessions remain stable across restarts and migrations. |
| `CSRF_SECRET`            | `change-this-secret`      | Recommended in production so CSRF validation remains stable across restarts.        |
| `AUTH_MODE`              | `local`                   | `local`, `hybrid`, `oidc_enforced`.                                                 |
| `ENFORCE_HTTPS_REDIRECT` | `true`                    | Set to `false` to disable the built-in HTTP→HTTPS redirect when your outer gateway handles it. |
| `PASSWORD_MIN_LENGTH` | `12` | Local-auth password minimum length. Combine with `PASSWORD_REQUIRE_*` flags to relax or enforce complexity. |
| `BACKUP_SCHEDULE` | unset | Optional 5- or 6-field cron expression for scheduled SQLite backups, e.g. `0 0 4 * * *`. |
| `BACKUP_DIR` | `/app/backups` | Directory where scheduled SQLite backup files are written. Mount this to persistent storage. |
| `BACKUP_RETENTION_DAYS` | `14` | Age (in days) after which older backup files are pruned. |

</details>

<details>
<summary>Database provider</summary>

ExcaliDash supports SQLite by default and PostgreSQL for deployments that want an external database. Set `DATABASE_PROVIDER` and `DATABASE_URL` together so startup, Prisma generation, and migrations all target the same provider.

SQLite is the recommended single-instance path:

```yaml
backend:
  environment:
    - DATABASE_PROVIDER=sqlite
    - DATABASE_URL=file:/app/prisma/dev.db
  volumes:
    - /mnt/user/appdata/excalidash/prisma:/app/prisma
```

PostgreSQL uses a normal Prisma PostgreSQL connection string:

```yaml
backend:
  environment:
    - DATABASE_PROVIDER=postgresql
    - DATABASE_URL=postgresql://user:password@postgres:5432/excalidash
```

The Docker entrypoint copies the matching provider-specific migration folder and rewrites the runtime Prisma schema before running Prisma commands. For schema changes, generate migrations through the provider helper so checked-in migrations stay separated:

```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/excalidash"
./scripts/generate-migrations.sh --dev add_feature_name
```

The helper prompts for SQLite or PostgreSQL, sets `DATABASE_PROVIDER`, and writes the generated migration under `backend/prisma/migrations/<provider>/`. Switching providers does not migrate existing data between SQLite and PostgreSQL; treat the target database as a separate install unless you build and verify an explicit data migration.

**PostgreSQL:** `docker-compose.pg-test.yml` is a runnable local example that brings up a PostgreSQL container alongside the backend wired to it. Use it to try the PostgreSQL path end to end:

```bash
docker compose -f docker-compose.pg-test.yml up
```

The credentials baked into that file are for local testing only; supply your own secrets and connection string for any real deployment.

</details>

<details>
<summary>Storage quickstarts</summary>

ExcaliDash has two independent storage choices: the **database** (sqlite or postgres, via `DATABASE_URL`/`DATABASE_PROVIDER`) and where **image blobs** live (database bytes by default, or S3 when `S3_BUCKET` is set). On startup the backend prints a single `STORAGE` block (see the sample at the end) so you can confirm both at a glance.

### Migrate sqlite → postgres

Switching the Prisma provider does **not** copy your data — the two databases are separate installs. Move data with the portable ExcaliDash archive (the same format the dashboard's Export/Import uses), then point the backend at postgres:

1. On the running sqlite instance, export a full archive: `GET /api/export/excalidash` (Dashboard → Export all). Save the downloaded archive.
2. Stand up the postgres database. The Docker entrypoint copies the matching migration folder from `backend/prisma/migrations/postgresql/` and applies it on boot, so start the backend once with the new env to create the schema:
   ```yaml
   backend:
     environment:
       - DATABASE_PROVIDER=postgresql
       - DATABASE_URL=postgresql://user:password@postgres:5432/excalidash
   ```
3. Import the archive into the fresh postgres instance: `POST /api/import/excalidash` (Dashboard → Import). Optionally dry-run first with `POST /api/import/excalidash/verify`.

Image blobs travel inside the archive, so this also carries database-stored images across. (`docker-compose.pg-test.yml` is a ready-made local postgres target for rehearsing the import.)

### Migrate local (database bytes) → S3

Set the S3 variables and restart — no script or downtime. For **AWS**, the bucket + credentials are enough:

```yaml
backend:
  environment:
    - S3_BUCKET=excalidash-images
    - AWS_ACCESS_KEY_ID=...
    - AWS_SECRET_ACCESS_KEY=...
    # - S3_REGION=us-east-1   # optional, defaults to us-east-1
```

For **MinIO / Cloudflare R2** and other S3-compatible services, add the endpoint, path-style (MinIO), and a public base URL:

```yaml
backend:
  environment:
    - S3_BUCKET=excalidash-images
    - S3_ENDPOINT=https://minio.example.com
    - S3_FORCE_PATH_STYLE=true          # MinIO; leave unset for R2/OSS virtual-hosted
    - S3_PUBLIC_URL=https://cdn.example.com   # public base URL of the bucket/CDN
    - AWS_ACCESS_KEY_ID=...
    - AWS_SECRET_ACCESS_KEY=...
```

Existing drawings migrate **lazily**: each drawing's images move to S3 the next time that drawing is saved (its inline blobs are interned to S3 and rewritten to refs on the next scene save). There is no backfill script and no downtime — untouched drawings keep serving their existing images until they are next edited. Half-configuring S3 (any `S3_*`/`AWS_*` variable without `S3_BUCKET`) fails fast at startup with an actionable message, so you cannot silently keep writing to the database while thinking S3 is on.

### Sample healthy STORAGE block

```
+------------------------------------------------------------------------+
| STORAGE                                                                |
| -------                                                                |
| Database:      postgresql (postgres:5432/excalidash)                   |
| File storage:  s3                                                      |
|   Bucket:      excalidash-images                                       |
|   Region:      us-east-1                                               |
|   Endpoint:    https://minio.example.com                              |
|   Public URL:  https://cdn.example.com                                |
|   Path style:  on                                                      |
|   Reachable:   yes (HeadBucket ok)                                     |
| Limits:        FILE_UPLOAD_MAX_MB=100 (per image), BODY_LIMIT_MB=50 ...|
| Backups:       off                                                     |
+------------------------------------------------------------------------+
```

For the default single-instance setup the same block reads `Database: sqlite (...)` and `File storage: database (default)`. A `Reachable: NO` line (or a `custom S3_ENDPOINT set without S3_PUBLIC_URL` warning) flags a misconfiguration without crashing startup.

</details>

<details>
<summary>Offline / No-network deployments</summary>

ExcaliDash packages the Excalidraw runtime assets into the frontend image and sets `window.EXCALIDRAW_ASSET_PATH` to the local origin, so browser operations such as inserting images and exporting drawings do not need `unpkg.com` or other public CDNs. The production Nginx CSP is intentionally self-hosted for scripts, styles, and fonts.

The backend update checker is the remaining optional outbound call. Disable it for sealed networks:

```bash
UPDATE_CHECK_OUTBOUND=false
```

</details>

<details>
<summary>Password policy, preferences, and backups</summary>

Local authentication defaults to the previous strong policy: 12-100 characters with uppercase, lowercase, number, and symbol requirements. Internal deployments can relax it with environment variables:

```bash
PASSWORD_MIN_LENGTH=10
PASSWORD_REQUIRE_UPPERCASE=false
PASSWORD_REQUIRE_LOWERCASE=false
PASSWORD_REQUIRE_NUMBER=false
PASSWORD_REQUIRE_SYMBOL=false
```

The active policy is exposed through `/api/auth/status`, so registration, password reset, admin-created users, and profile password changes all validate against the same backend policy.

Per-user theme and dashboard sort preferences are stored server-side once a user is authenticated, with localStorage as a pre-login/offline fallback.

The app-shell display font can be replaced at build time with `VITE_EXCALIDASH_UI_FONT_FAMILY` and a self-hosted WOFF2 file via `VITE_EXCALIDASH_UI_FONT_URL`. Excalidraw canvas font support remains governed by the embedded Excalidraw package.

For scheduled SQLite backups, mount a host path and configure a cron schedule:

```yaml
backend:
  environment:
    - DATABASE_URL=file:/app/prisma/dev.db
    - BACKUP_SCHEDULE=0 0 4 * * *
    - BACKUP_DIR=/app/backups
    - BACKUP_RETENTION_DAYS=14
  volumes:
    - /mnt/user/appdata/excalidash/prisma:/app/prisma
    - /mnt/user/backups/excalidash:/app/backups
```

For Unraid or other Docker templates, map the host directory to container path `/app/prisma` and keep `DATABASE_URL=file:/app/prisma/dev.db`; named volumes are harder to inspect and easier to accidentally recreate.

</details>

<details>
<summary>Agent API</summary>

ExcaliDash exposes a built-in HTTPS Agent API for programmatic read/edit of a
drawing (atomic semantic ops, live socket updates). It is always available — no
extra service to run. Tokens are minted per drawing from the Share dialog. The
ops endpoint has its own rate limiter (`AGENT_OPS_RATE_LIMIT_MAX` /
`AGENT_OPS_RATE_LIMIT_WINDOW_MS`, see the [Configuration Reference](CONFIGURATION.md))
and emits `agent_ops_applied` / `agent_token_created` / `agent_token_revoked`
audit events. Full reference and curl examples: [docs/AGENT_API.md](AGENT_API.md).

</details>

<details>
<summary>Community integrations</summary>

- **[excalidash-mcp](https://github.com/davifernan/excalidash-mcp)** — community MCP server that lets AI agents draw and edit ExcaliDash boards live.

</details>
