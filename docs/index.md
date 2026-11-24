---
title: ExcaliDash — Self-Hosted Excalidraw Workspace
titleTemplate: false
description: Self-host Excalidraw with saved drawings, collections, real-time collaboration, version history, and OIDC SSO. Deploy with Docker Compose.
layout: home
pageClass: canvas-home
markdownStyles: true
footer: true

canvasHero:
  name: "ExcaliDash"
  headline: Self-hosted Excalidraw workspace with real-time collaboration
  tagline: Persistent server-side drawings, collections, live multiplayer cursors, version history, and OIDC SSO—deployed in one Docker Compose stack.
  actions:
    - theme: brand
      text: Deploy with Docker
      link: /deploy/docker
    - theme: alt
      text: Self-hosting guide
      link: /guides/self-host-excalidraw

canvasFeatures:
  - title: Organize
    details: Save drawings to your database, group them into collections, search, and access them from any device.
    link: /guide/first-run
  - title: Collaborate
    details: Edit together with live named cursors, presence avatars, follow mode, and scoped share links.
    link: /guide/collaboration
  - title: Version history
    details: Preview automatic drawing snapshots on the canvas and restore earlier revisions in two clicks.
    link: /guide/storage-backups
  - title: OIDC & local auth
    details: Sign in with local accounts or OpenID Connect (Authentik, Keycloak, Pocket ID, Authelia), plus API keys.
    link: /guides/excalidraw-oidc-sso
  - title: Portable backups
    details: Import or export standard .excalidraw files anytime, or export full .excalidash workspace archives.
    link: /guide/storage-backups
  - title: SQLite, Postgres & S3
    details: Zero-config SQLite out of the box, or scale up to PostgreSQL and S3-compatible object storage.
    link: /guides/excalidraw-postgresql-s3

canvasImages:
  - label: All Drawings
    light: /images/workspace-light.png
    dark: /images/workspace.png
    alt: ExcaliDash self-hosted Excalidraw dashboard showing drawing previews, collections, search, and sorting controls
  - label: Collaboration
    light: /images/collaboration-light.png
    dark: /images/collaboration-dark.png
    alt: Four collaborators editing an Excalidraw deployment diagram together with live cursors and presence avatars
---

## Why ExcaliDash instead of the official `excalidraw/excalidraw` container

The official `excalidraw/excalidraw` Docker image is a static frontend: scenes are stored only in browser `localStorage`, there are no folders or accounts, and live collaboration routes through Excalidraw's public servers unless you build and maintain a separate `excalidraw-room` backend.

ExcaliDash wraps the Excalidraw editor in a complete self-hosted workspace backed by SQLite or PostgreSQL and a built-in Socket.IO collaboration server. It is an independent open-source (GNU LGPL v3.0) project and is not affiliated with Excalidraw.

| Capability                      | Official `excalidraw/excalidraw`          | ExcaliDash                                                  |
| ------------------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| Persistent server-side drawings | Browser `localStorage` only               | SQLite or PostgreSQL + optional S3                          |
| Real-time collaboration         | Public server or custom `excalidraw-room` | Built-in Socket.IO backend + follow mode                    |
| Dashboard, collections & search | No                                        | Yes                                                         |
| User accounts & OIDC SSO        | No                                        | Local accounts + Authentik, Keycloak, Pocket ID, Authelia   |
| Sharing & permissions           | Anonymous room links                      | Account view/edit access + expiring share links             |
| Version history & backups       | Manual `.excalidraw` save                 | Automatic snapshots + `.excalidash` & `.excalidraw` exports |

## Start in two minutes with Docker Compose

Run the production stack with persistent SQLite storage on port `6767`:

```yaml
services:
  backend:
    image: zimengxiong/excalidash-backend:latest
    container_name: excalidash-backend
    init: true
    environment:
      DATABASE_PROVIDER: sqlite
      DATABASE_URL: file:/app/prisma/dev.db
      PORT: 8000
      NODE_ENV: production
      AUTH_MODE: local
    volumes:
      - backend-data:/app/prisma
    restart: unless-stopped

  frontend:
    image: zimengxiong/excalidash-frontend:latest
    container_name: excalidash-frontend
    ports:
      - "6767:8080"
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  backend-data:
```

Run `docker compose up -d`, open `http://localhost:6767`, and create your administrator account.

## Guides for self-hosting Excalidraw

- [How to self-host Excalidraw with collaboration and saved drawings](/guides/self-host-excalidraw) — compare the official container, `excalidraw-room`, and ExcaliDash, then deploy a full stack.
- [Self-hosted Excalidraw+ alternative](/guides/excalidraw-plus-alternative) — feature-by-feature comparison with Excalidraw+ and migration from `.excalidraw` files.
- [Excalidraw with OIDC / SSO](/guides/excalidraw-oidc-sso) — native OpenID Connect setup for Authentik, Keycloak, Pocket ID, and Authelia with group-to-admin mapping.
- [Reverse proxy, HTTPS, and WebSockets](/guides/excalidraw-reverse-proxy) — copy-paste configs for Caddy, Nginx, Nginx Proxy Manager, Traefik, and Cloudflare Tunnel.
- [PostgreSQL and S3 / MinIO / R2 storage](/guides/excalidraw-postgresql-s3) — run ExcaliDash with PostgreSQL and external object storage.
- [Deploy on Coolify, Portainer, and Dokploy](/deploy/coolify-portainer) — ready-to-paste templates for self-hosted PaaS panels.

## Common questions

### What does ExcaliDash add to the official Excalidraw Docker image?

The official `excalidraw/excalidraw` container is a static frontend that saves drawings only in browser `localStorage` and routes collaboration to public servers. ExcaliDash adds a searchable dashboard, persistent SQLite or PostgreSQL storage, collections, self-hosted Socket.IO collaboration, version history, local and OIDC SSO accounts, and automated backups.

### Does ExcaliDash real-time collaboration stay on my own server?

Yes. ExcaliDash runs its own Socket.IO collaboration backend inside the Docker Compose stack, so edits, live cursors, presence avatars, and viewport follow mode stay on your server without needing a separate `excalidraw-room` container. See [Collaboration and sharing](/guide/collaboration).

### Is ExcaliDash a self-hosted alternative to Excalidraw+?

Yes. ExcaliDash is an independent open-source (LGPL-3.0) workspace that brings saved drawings, collections, team sharing, live collaboration, version history, and OIDC SSO to your own infrastructure. Read the full [Excalidraw+ self-hosted alternative comparison](/guides/excalidraw-plus-alternative).

### Can I import and export standard `.excalidraw` files?

Yes. Import existing `.excalidraw` files into your workspace, export any drawing back to `.excalidraw` anytime, or export full `.excalidash` archives with collections, version history, and uploaded images. See [Storage and backups](/guide/storage-backups).

### Can I run ExcaliDash behind Caddy, Nginx, Traefik, or Cloudflare Tunnel?

Yes. Point your reverse proxy to host port `6767` or container port `8080`, forward WebSocket upgrades on `/socket.io/`, set `FRONTEND_URL` to your public `https://` origin, and set `TRUST_PROXY` to match your proxy hop count. See the [reverse proxy and HTTPS guide](/guides/excalidraw-reverse-proxy).
