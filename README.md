<img src="readme-assets/logoExcaliDash.png" alt="ExcaliDash Logo" width="80" height="88">

# ExcaliDash

![License](https://img.shields.io/github/license/zimengxiong/ExcaliDash)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://hub.docker.com)

A self-hosted dashboard and organizer for [Excalidraw](https://github.com/excalidraw/excalidraw) with live collaboration features.

![](readme-assets/demo.gif)

## Table of Contents

- [Features](#features)
- [Drawing engines](#drawing-engines)
- [Upgrading](#upgrading)
- [Installation](#installation)
  - [Quickstart](#quickstart)
  - [Advanced](#advanced)
- [Development](#development)
- [Community \& Integrations](#community--integrations)
- [Credits](#credits)

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
<summary>Two canvas engines: Excalidraw and tldraw</summary>

Create each drawing with either the default Excalidraw canvas or a [tldraw](https://tldraw.dev) canvas. The engine is chosen when the drawing is created and is fixed for that drawing's lifetime — existing drawings are unaffected and Excalidraw stays the default everywhere. See [Drawing engines](#drawing-engines) for the license terms that apply to the tldraw canvas.

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

## Drawing engines

Every drawing is backed by one of two canvas engines, chosen when the drawing is created:

- **Excalidraw** — the default. Nothing about existing drawings or the default new-drawing flow changes; if you never opt into tldraw you can ignore this section entirely.
- **tldraw** — an alternative canvas powered by the [tldraw SDK](https://tldraw.dev).

The engine is immutable after creation. There is no in-place conversion between the two (the underlying scene models differ fundamentally), so the editor, history, and export always interpret a drawing through the engine it was created with. On the dashboard, tldraw drawings carry a small engine badge; Excalidraw drawings are unbadged because they are the default.

### tldraw license and the "Made with tldraw" watermark

ExcaliDash pins **tldraw SDK 3.x**, which is distributed under the [tldraw SDK 3.x license](https://tldraw.dev/legal/tldraw-sdk-3-x-license). That license permits free commercial and non-commercial use **as long as the on-canvas "Made with tldraw" watermark stays visible.** ExcaliDash keeps the watermark on by default, and you must not hide or remove it unless you hold a license that permits doing so — removing it without a key is a license violation.

If you purchase a tldraw license key, set it at build time to remove the watermark:

```bash
# frontend build-time env var (see docs/CONFIGURATION.md)
VITE_TLDRAW_LICENSE_KEY=your-key-here
```

The key is passed to the tldraw editor only; it has no effect on Excalidraw drawings, and leaving it unset is fully supported (you simply keep the watermark).

> **Note on tldraw 4.x:** the current tldraw 4.x line requires a per-deployment license key even for its free tier, which is a poor fit for a self-hosted app that must run without any external registration. ExcaliDash therefore stays on the watermark-based 3.x line for now; upgrading to 4.x is deferred until that key requirement can be handled cleanly.

The size of a tldraw scene (its inline image assets included) is capped by `TLDRAW_MAX_SCENE_MB` (default 15 MB); see [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

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

- Don’t add `-v` to `down` unless you intend to delete the persistent backend volume (your SQLite DB + secrets).
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

The root README keeps the install path short. See
[advanced deployment and operations](docs/DEPLOYMENT.md) for reverse proxy,
auth/OIDC, database provider, offline, backup, password policy, and operational
details.

For release-candidate validation across multiple local configurations, see the
[configuration lab](docs/CONFIG_LAB.md).

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

# Agent API

ExcaliDash ships a built-in HTTPS API for AI agents and scripts to read and edit
a drawing through atomic semantic ops, with live updates to open editors. Mint a
per-drawing token from the Share dialog and see [docs/AGENT_API.md](docs/AGENT_API.md)
for the full flow (summary, ops batch, element inspection, undo), the op schema,
and the error-code catalog.

# Community & Integrations

Third-party projects that build on ExcaliDash. These are community-maintained and not part of this repository:

- [excalidash-mcp](https://github.com/davifernan/excalidash-mcp) — an MCP server that lets AI agents draw and edit ExcaliDash boards live over Socket.IO, with high-level tools and a compact scene DSL.

# Credits
If you find ExcaliDash useful, please consider [sponsoring](https://github.com/sponsors/ZimengXiong)
- Example designs from:
  - <https://github.com/Prakash-sa/system-design-ultimatum/tree/main>
  - <https://github.com/kitsteam/excalidraw-examples/tree/main>
- [The amazing work of Excalidraw & contributors](https://www.npmjs.com/package/@excalidraw/excalidraw)
