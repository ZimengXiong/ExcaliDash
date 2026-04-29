<img src="readme-assets/logoExcaliDash.png" alt="ExcaliDash Logo" width="80" height="88">

# ExcaliDash

![License](https://img.shields.io/github/license/zimengxiong/ExcaliDash)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://hub.docker.com)

A self-hosted dashboard and organizer for [Excalidraw](https://github.com/excalidraw/excalidraw) with live collaboration features.

> **This is a personal fork of [ZimengXiong/ExcaliDash](https://github.com/ZimengXiong/ExcaliDash).** See [Fork Customizations](#fork-customizations) for changes specific to this fork.

![](readme-assets/demo.gif)

## Table of Contents

- [Fork Customizations](#fork-customizations)
- [Features](#features)
- [Upgrading](#upgrading)
- [Installation](#installation)
  - [Quickstart](#quickstart)
  - [Advanced](#advanced)
- [Development](#development)
- [Credits](#credits)

## Fork Customizations

Changes made in this fork on top of the upstream repository:

- **Mouse wheel zoom to cursor** — scrolling zooms toward the cursor position without needing to hold `Ctrl`/`Cmd`. This matches the behavior most users expect from design tools.
- **Local data directory** — Docker Compose volumes are configured to store all persistent data (database, drawings, secrets) in a local `./data` folder that is git-ignored, making backups and migrations straightforward.

## Features

<details>
<summary>Persistent storage for all your drawings</summary>

![](readme-assets/dashboard.png)

</details>

<details>
<summary>Real time collaboration</summary>

![](readme-assets/collabDemo.gif)

</details>

<details>
<summary>Version history and restore</summary>

Automatically retain recent drawing snapshots, preview past versions from the editor, and restore a previous state when needed.

</details>

<details>
<summary>(Optional) Multi User Authentication, OIDC Support</summary>

### Sign in with OIDC

![](readme-assets/signInOIDC.png)

### Migration from v0.3

![](readme-assets/migrationScreen.png)

### Admin Bootstrap

![](readme-assets/adminBootstrap.png)

### Admin Dashboard

![](readme-assets/adminDashboard.png)

</details>

<details>
<summary>Scoped internal & external sharing</summary>

![](readme-assets/scoped.png)

</details>
<details>
<summary>Search your drawings</summary>

![](readme-assets/search.gif)

</details>

<details>
<summary>Drag and drop drawings into collections</summary>

![](readme-assets/collections.gif)

</details>

<details>
<summary>Export/import your drawings for backup</summary>

### Excalidash uses a non-proprietary archival format that stores your drawings in plain .excalidraw format

![](readme-assets/backupsImport.gif)

</details>

# Upgrading

See [release notes](https://github.com/ZimengXiong/ExcaliDash/releases) for a specific release.

ExcaliDash includes an in-app update notifier that checks GitHub Releases. If your deployment must not make outbound network calls, disable it on the backend:

```bash
UPDATE_CHECK_OUTBOUND=false
```

## Docker Hub Upgrades

If you deployed using `docker-compose.prod.yml` (Docker Hub images), upgrade by pulling the latest images and recreating containers:

```bash
docker compose -f docker-compose.prod.yml pull && \
  docker compose -f docker-compose.prod.yml up -d
```

If you prefer a clean stop/start (more downtime, but simpler), you can do:

```bash
docker compose -f docker-compose.prod.yml down && \
  docker compose -f docker-compose.prod.yml pull && \
  docker compose -f docker-compose.prod.yml up -d
```

Notes:

- Don't add `-v` to `down` unless you intend to delete the persistent backend volume (your SQLite DB + secrets).
- Only add `--remove-orphans` if you previously ran a different Compose file for the same project name and need to remove old/renamed services.

# Installation

> [!CAUTION]
> This is a BETA deployment and production-readiness depends on deployment controls:
> use TLS, trusted reverse proxy, fixed secrets, backups, and endpoint rate limits.

> [!CAUTION]
> ExcaliDash is in BETA. Please backup your data regularly.

## Quickstart

Prereqs: Docker + Docker Compose v2.

<details>
<summary>Docker Hub (Recommended)</summary>

## Docker Hub (Recommended)

```bash
# Download docker-compose.prod.yml
curl -OL https://raw.githubusercontent.com/ZimengXiong/ExcaliDash/main/docker-compose.prod.yml

# Pull images
docker compose -f docker-compose.prod.yml pull

# Run container
docker compose -f docker-compose.prod.yml up -d

# Access the frontend at localhost:6767
```

For single-container deployments, `JWT_SECRET` can be omitted and will be auto-generated and persisted in the backend volume on first start. For portability and most production deployments, set a fixed `JWT_SECRET` explicitly.

By default, the provided Compose files set `TRUST_PROXY=false` for safer setup. Only set `TRUST_PROXY` to a positive hop count (for example, `1`) when requests always pass through a trusted reverse proxy that correctly sets forwarded headers.

</details>

<details>
<summary>Docker Build</summary>

## Docker Build

```bash
# Clone the repository (recommended)
git clone git@github.com:ZimengXiong/ExcaliDash.git

# or, clone with HTTPS
# git clone https://github.com/ZimengXiong/ExcaliDash.git

docker compose build
docker compose up -d

# Access the frontend at localhost:6767
```

</details>

## Advanced

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
    # Optional split-horizon setup when backend reaches IdP via internal DNS.
    # Keep OIDC_ISSUER_URL browser-routable; set OIDC_DISCOVERY_URL for backend-only access.
    # - OIDC_DISCOVERY_URL=http://auth-internal:9000/application/o/excalidash/
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

| Topic                       | Notes                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| OIDC-only (`oidc_enforced`) | You typically do not use local bootstrap admin registration; first admin can be created through your IdP depending on config. |
| Reverse proxy               | Set `FRONTEND_URL` and `TRUST_PROXY` correctly or auth + websockets may fail.                                                 |
| ID token algorithm          | ExcaliDash defaults to `RS256`. If your IdP client is explicitly configured for another signed ID-token algorithm such as `HS256`, set `OIDC_ID_TOKEN_SIGNED_RESPONSE_ALG` to match that exact client setting. `none` is not allowed, and `HS*` requires `OIDC_CLIENT_SECRET`. |
| Keycloak issuer format      | Use realm issuer URL: `https://<keycloak-host>/realms/<realm>`.                                                               |
| Authentik issuer format     | Use provider issuer URL: `https://<authentik-host>/application/o/<provider-slug>/`.                                           |
| Authentik `email_verified`  | If Authentik does not emit `email_verified=true`, either add the scope mapping or set `OIDC_REQUIRE_EMAIL_VERIFIED=false`.   |
| Redirect URI                | Must be exact callback: `https://<excalidash-host>/api/auth/oidc/callback`.                                                   |
| Split-horizon IdP networking | Set `OIDC_ISSUER_URL` to the browser-reachable issuer and optionally `OIDC_DISCOVERY_URL` to a backend-reachable internal URL. |
| OIDC admin mapping          | If `OIDC_ADMIN_GROUPS` is set, admin role is reconciled on each authenticated request for OIDC users: users in those groups are promoted to `ADMIN`, users not in those groups are demoted to `USER`. |
| Legacy sessions             | Users with old sessions (issued before group claims were embedded) should sign out/in once so OIDC group claims are refreshed. |

</details>

<details>
<summary>Local OIDC Test Stack (Docker + Keycloak)</summary>

### Local OIDC Test Stack (Docker + Keycloak)

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
| `DATABASE_URL`           | `file:/app/prisma/dev.db` | SQLite file or external DB URL.                                                     |
| `FRONTEND_URL`           | `http://localhost:6767`   | Allowed frontend origin(s), comma-separated for multiple entries.                   |
| `TRUST_PROXY`            | `false`                   | `false`, `true`, or hop count (for example `1`).                                    |
| `JWT_SECRET`             | `change-this-secret...`   | Recommended in production so sessions remain stable across restarts and migrations. |
| `CSRF_SECRET`            | `change-this-secret`      | Recommended in production so CSRF validation remains stable across restarts.        |
| `AUTH_MODE`              | `local`                   | `local`, `hybrid`, `oidc_enforced`.                                                 |
| `ENFORCE_HTTPS_REDIRECT` | `true`                    | Set to `false` to disable the built-in HTTP→HTTPS redirect when your outer gateway handles it. |

</details>

# Development

For contributor workflow, `make dev` starts the app in local single-user mode so you can reproduce editor bugs without going through login/onboarding. Use `make dev-auth` if you need to test local auth or OIDC flows from your `backend/.env`.

<details>
<summary>Clone the Repository</summary>

## Clone the Repository

```bash
# Clone the repository (recommended)
git clone git@github.com:ZimengXiong/ExcaliDash.git

# or, clone with HTTPS
# git clone https://github.com/ZimengXiong/ExcaliDash.git
```

</details>

<details>
<summary>Frontend</summary>

## Frontend

```bash
cd ExcaliDash/frontend
npm install

# Copy environment file and customize if needed
cp .env.example .env

npm run dev
```

</details>

<details>
<summary>Backend</summary>

## Backend

```bash
cd ExcaliDash/backend
npm install

# Copy environment file and customize if needed
cp .env.example .env

# Generate Prisma client and setup database
npx prisma generate
npx prisma db push

npm run dev
```

</details>

<details>
<summary>Simulate Auth Onboarding (Development)</summary>

### Simulate Auth Onboarding (Development)

To simulate first-run authentication choice flows in local development:

```bash
cd ExcaliDash/backend

# Preview what would change (no data modifications)
npm run dev:simulate-auth-onboarding:dry-run

# Simulate "fresh install" onboarding state
# (wipes drawings/collections/libraries and removes non-bootstrap users)
npm run dev:simulate-auth-onboarding:fresh

# Simulate "migration" onboarding state (ensures legacy data exists)
npm run dev:simulate-auth-onboarding:migration
```

After running a simulation while the backend is already running, wait about 5 seconds
(auth mode cache TTL) or restart the backend before refreshing the UI.

</details>

<details>
<summary>Setup and Operational Scripts</summary>

### Setup and Operational Scripts

In `backend/package.json` there are helper scripts for maintenance:

| Script          | Purpose                                    |
| --------------- | ------------------------------------------ |
| `admin:recover` | Emergency admin credential recovery/reset. |

Admin recovery example:

```bash
cd backend
npm run admin:recover -- --identifier admin@example.com --generate --activate --must-reset
```

Common flags:

| Flag                          | Description                                              |
| ----------------------------- | -------------------------------------------------------- |
| `--password "<new-password>"` | Set explicit new password.                               |
| `--generate`                  | Generate a secure random password.                       |
| `--activate`                  | Activate the admin account immediately.                  |
| `--promote`                   | Promote user to admin role.                              |
| `--must-reset`                | Force password reset on first login.                     |
| `--disable-login-rate-limit`  | Temporarily disable login throttling for this operation. |

</details>

# Credits
If you find ExcaliDash useful, please consider [sponsoring](https://github.com/sponsors/ZimengXiong)
- Example designs from:
  - <https://github.com/Prakash-sa/system-design-ultimatum/tree/main>
  - <https://github.com/kitsteam/excalidraw-examples/tree/main>
- [The amazing work of Excalidraw & contributors](https://www.npmjs.com/package/@excalidraw/excalidraw)
