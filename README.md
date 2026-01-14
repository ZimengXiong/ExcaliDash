<img src="logoExcaliDash.png" alt="ExcaliDash Logo" width="80" height="88">

# ExcaliDash v0.1.8

![License](https://img.shields.io/github/license/zimengxiong/ExcaliDash)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://hub.docker.com)

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

- `FRONTEND_URL` (backend) must match the public URL that users hit (e.g. `https://excalidash.example.com`). This controls CORS and Socket.IO origin checks.
- `BACKEND_URL` (frontend) tells the Nginx container how to reach the backend from inside Docker/Kubernetes. Override it if your reverse proxy exposes the backend under a different hostname.

```yaml
# docker-compose.yml example
backend:
  environment:
    - FRONTEND_URL=https://excalidash.example.com
frontend:
  environment:
    # For standard Docker Compose (default)
    # - BACKEND_URL=backend:8000
    # For Kubernetes, use the service DNS name:
    - BACKEND_URL=excalidash-backend.default.svc.cluster.local:8000
```

### Multi-Container / Kubernetes Deployments

When running multiple backend replicas (e.g., Kubernetes, Docker Swarm, or load-balanced containers), you **must** set the `CSRF_SECRET` environment variable to the same value across all instances.

```bash
# Generate a secure secret
openssl rand -base64 32
```

```yaml
# docker-compose.yml or k8s deployment
backend:
  environment:
    - CSRF_SECRET=your-generated-secret-here
```

Without this, each container generates its own ephemeral CSRF secret, causing token validation failures when requests are routed to different replicas. Single-container deployments work without this setting.

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
