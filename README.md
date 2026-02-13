<img src="logoExcaliDash.png" alt="ExcaliDash Logo" width="80" height="88">

# ExcaliDash

![License](https://img.shields.io/github/license/zimengxiong/ExcaliDash)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://hub.docker.com)

_Original repo can be found [here](https://github.com/ZimengXiong/ExcaliDash)_

A self-hosted dashboard and organizer for [Excalidraw](https://github.com/excalidraw/excalidraw) with live collaboration features.

## Screenshots

![](dashboard.png)

![](demo.gif)

## Table of Contents

- [Screenshots](#screenshots)
- [Features](#features)
- [Upgrading](#upgrading)
- [Installation](#installation)
  - [Docker Hub (Recommended)](#dockerhub-recommended)
  - [Docker Build](#docker-build)
  - [Reverse Proxy / Traefik Setups](#reverse-proxy--traefik-setups-docker)
  - [Multi-Container / Kubernetes Deployments](#multi-container--kubernetes-deployments)
- [Development](#development)
  - [Clone the Repository](#clone-the-repository)
  - [Frontend](#frontend)
  - [Backend](#backend)
  - [Project Structure](#project-structure)
- [Credits](#credits)

## Features

<details>
<summary>Persistent storage for all your drawings</summary>

![](dashboardLight.png)

</details>

<details>
<summary>Real time collaboration</summary>

![](collabDemo.gif)

</details>

<details>
<summary>Search your drawings</summary>

![](searchPage.png)

</details>

<details>
<summary>Drag and drop drawings into collections</summary>

![](collectionsPage.png)

</details>

<details>
<summary>Export/import your drawings and databases for backup</summary>

![](settingsPage.png)

</details>

# Upgrading

See [release notes](https://github.com/ZimengXiong/ExcaliDash/releases) for a specific release.

</details>

# Installation

> [!CAUTION]
> NOT for production use. While attempts have been made at hardening (XSS/dompurify, CORS, rate-limiting, sanitization), they are inadequate for public deployment. Do not expose any ports.

> [!CAUTION]
> ExcaliDash is in BETA. Please backup your data regularly (e.g. with cron).

## Docker Hub (Recommended)

[Install Docker](https://docs.docker.com/desktop/)

```bash
# Download docker-compose.prod.yml
curl -OL https://raw.githubusercontent.com/ZimengXiong/ExcaliDash/refs/heads/main/docker-compose.prod.yml

# Pull images
docker compose -f docker-compose.prod.yml pull

# Run container
docker compose -f docker-compose.prod.yml up -d

# Access the frontend at localhost:6767
```

For single-container deployments, `JWT_SECRET` can be omitted and will be auto-generated and persisted in the backend volume on first start. For portability and all multi-instance deployments, set a fixed `JWT_SECRET` explicitly.

By default, the provided Compose files set `TRUST_PROXY=false` for safer setup. Only set `TRUST_PROXY` to a positive hop count (for example, `1`) when requests always pass through a trusted reverse proxy that correctly sets forwarded headers.

## Docker Build

[Install Docker](https://docs.docker.com/desktop/)

```bash
# Clone the repository (recommended)
git clone git@github.com:ZimengXiong/ExcaliDash.git

# or, clone with HTTPS
# git clone https://github.com/ZimengXiong/ExcaliDash.git

docker compose build
docker compose up -d

# Access the frontend at localhost:6767
```

### Reverse Proxy / Traefik Setups (Docker)

When running ExcaliDash behind Traefik, Nginx, or another reverse proxy, configure both containers so that API + WebSocket calls resolve correctly:

- `FRONTEND_URL` (backend) must match the public URL that users hit (e.g. `https://excalidash.example.com`). This controls CORS and Socket.IO origin checks. **Supports multiple comma-separated URLs** for accessing from different addresses.
- `TRUST_PROXY` (backend) should be set to `1` when requests pass through one trusted reverse proxy hop (for example: frontend nginx -> backend) and forwarded headers are sanitized. This ensures rate limiting and logging use the real client IP from trusted proxy headers.
- `BACKEND_URL` (frontend) tells the Nginx container how to reach the backend from inside Docker/Kubernetes. Override it if your reverse proxy exposes the backend under a different hostname.

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
frontend:
  environment:
    # For standard Docker Compose (default)
    # - BACKEND_URL=backend:8000
    # For Kubernetes, use the service DNS name:
    - BACKEND_URL=excalidash-backend.default.svc.cluster.local:8000
```

### Multi-Container / Kubernetes Deployments

When running multiple backend replicas (e.g., Kubernetes, Docker Swarm, or load-balanced containers), you **must** set both `JWT_SECRET` and `CSRF_SECRET` to the same values across all instances.

```bash
# Generate a secure secret
openssl rand -base64 32
```

```yaml
# docker-compose.yml or k8s deployment
backend:
  environment:
    - JWT_SECRET=your-generated-jwt-secret-here
    - CSRF_SECRET=your-generated-secret-here
```

Without this, each container generates its own ephemeral CSRF secret, causing token validation failures when requests are routed to different replicas. Single-container deployments work without this setting.

### Authentication Modes (Local + OIDC)

ExcaliDash supports three auth modes via backend `AUTH_MODE`:

- `local` (default): native email/password login only.
- `hybrid`: native login + OIDC login.
- `oidc_enforced`: OIDC-only login (native login/register disabled).

For OIDC modes (`hybrid` or `oidc_enforced`), set:

```yaml
backend:
  environment:
    - AUTH_MODE=oidc_enforced
    - OIDC_PROVIDER_NAME=Authentik
    - OIDC_ISSUER_URL=https://auth.example.com/application/o/excalidash/
    - OIDC_CLIENT_ID=your-client-id
    - OIDC_CLIENT_SECRET=your-client-secret
    - OIDC_REDIRECT_URI=https://excalidash.example.com/api/auth/oidc/callback
    - OIDC_SCOPES=openid profile email
```

In `oidc_enforced` mode, unauthenticated users are automatically redirected to `/api/auth/oidc/start`.
Users are linked by `(issuer, sub)` first, then by verified email, and optionally auto-provisioned.

# Development

## Clone the Repository

```bash
# Clone the repository (recommended)
git clone git@github.com:ZimengXiong/ExcaliDash.git

# or, clone with HTTPS
# git clone https://github.com/ZimengXiong/ExcaliDash.git
```

## Frontend

```bash
cd ExcaliDash/frontend
npm install

# Copy environment file and customize if needed
cp .env.example .env

npm run dev
```

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

## Project Structure

```
ExcaliDash/
├── backend/                 # Node.js + Express + Prisma
│   ├── src/
│   │   └── index.ts        # Main server file
│   ├── prisma/
│   │   ├── schema.prisma   # Database schema
│   │   └── dev.db         # SQLite database
│   └── package.json
├── frontend/               # React + TypeScript + Vite
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/         # Page components
│   │   ├── hooks/         # Custom hooks
│   │   └── api/           # API client
│   └── package.json
└── README.md
```

# Credits

- Example designs from:
  - https://github.com/Prakash-sa/system-design-ultimatum/tree/main
  - https://github.com/kitsteam/excalidraw-examples/tree/main
- [The Amazing work of Excalidraw developers](https://www.npmjs.com/package/@excalidraw/excalidraw)
