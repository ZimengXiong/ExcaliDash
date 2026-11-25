---
title: "ExcaliDash: Self-Hosted Excalidraw with Saving & Collaboration"
titleTemplate: false
description: Self-host Excalidraw with saved drawings, real-time collaboration, collections, version history, and OIDC SSO. Deploy ExcaliDash with Docker Compose.
layout: home
pageClass: canvas-home
markdownStyles: true
footer: true

canvasHero:
  name: "ExcaliDash"
  headline: "Self-hosted Excalidraw with saved drawings and real-time collaboration"
  tagline: Persistent SQLite or PostgreSQL storage, collections, built-in Socket.IO collaboration, version history, and OIDC SSO in one Docker Compose stack.
  actions:
    - theme: brand
      text: Deploy with Docker
      link: /deploy/docker
    - theme: alt
      text: Self-hosting guide
      link: /guides/self-host-excalidraw

canvasFeatures:
  - title: Persistent drawings
    details: Store drawings in SQLite or PostgreSQL, organize them in collections, search by title, and open them from any device.
    link: /guide/first-run
  - title: Built-in collaboration
    details: Edit together on your own server with live named cursors, presence avatars, follow mode, and expiring share links.
    link: /guide/collaboration
  - title: Version history
    details: Inspect automatic Brotli-compressed drawing snapshots on the canvas and restore earlier revisions in two clicks.
    link: /guide/storage-backups
  - title: OIDC & local auth
    details: Sign in with local accounts or native OpenID Connect (Authentik, Keycloak, Pocket ID, Authelia), plus scoped API keys.
    link: /guides/excalidraw-oidc-sso
  - title: Portable exports
    details: Import and export standard .excalidraw files anytime, or download full .excalidash workspace archives.
    link: /guide/storage-backups
  - title: SQLite, Postgres & S3
    details: Run zero-config SQLite out of the box, or switch to PostgreSQL and S3-compatible object storage with env vars.
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

## Excalidraw vs ExcaliDash: what the official Docker image is missing

ExcaliDash {{ $frontmatter.excalidashVersion }} is licensed under LGPL-3.0, publishes `linux/amd64` and `linux/arm64` Docker images, and runs on SQLite, PostgreSQL, and S3-compatible storage.

The official `excalidraw/excalidraw` Docker image is a static frontend. Scenes stay inside a single browser's `localStorage`, there are no accounts or folders, and live collaboration routes through Excalidraw's public server unless you rebuild the frontend and run a separate `excalidraw-room` container.

ExcaliDash packages the Excalidraw editor with a Node.js backend, SQLite or PostgreSQL persistence, and a built-in Socket.IO collaboration server on `/socket.io/`. It is an independent open-source project and is not affiliated with Excalidraw.

| Capability                      | Official `excalidraw/excalidraw`          | Excalidraw+       | ExcaliDash                                                  |
| ------------------------------- | ----------------------------------------- | ----------------- | ----------------------------------------------------------- |
| Hosting                         | Self-hosted static frontend               | Hosted SaaS only  | Self-hosted Docker Compose                                  |
| Persistent server-side drawings | Browser `localStorage` only               | Cloud workspace   | SQLite or PostgreSQL + optional S3                          |
| Real-time collaboration         | Public server or custom `excalidraw-room` | Yes               | Built-in Socket.IO backend + follow mode                    |
| Dashboard, collections & search | No                                        | Yes               | Yes                                                         |
| User accounts & OIDC SSO        | No                                        | Hosted accounts   | Local accounts + Authentik, Keycloak, Pocket ID, Authelia   |
| Sharing & permissions           | Anonymous room links                      | Workspace sharing | Account view/edit access + expiring share links             |
| Version history & backups       | Manual `.excalidraw` save                 | Yes               | Automatic snapshots + `.excalidash` & `.excalidraw` exports |
| License & cost                  | MIT, free                                 | Paid subscription | LGPL-3.0, free                                              |

Evaluating other GitHub projects like Excaliself, excalidraw-full, or alswl/excalidraw-collaboration? Read [self-hosted Excalidraw projects compared](/guides/self-hosted-excalidraw-projects). To see how the backend handles storage, sync, and auth, read [how ExcaliDash works](/guides/how-excalidash-works).

## Deploy self-hosted Excalidraw with Docker Compose

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

Start with [how to self-host Excalidraw with Docker Compose](/guides/self-host-excalidraw) or [how ExcaliDash works](/guides/how-excalidash-works). If you are comparing alternatives or troubleshooting the official container, read [self-hosted Excalidraw+ alternative](/guides/excalidraw-plus-alternative), [self-hosted Excalidraw projects compared](/guides/self-hosted-excalidraw-projects), [self-host Excalidraw collaboration (`excalidraw-room`)](/guides/excalidraw-collaboration-server), or [why Excalidraw Docker is not saving drawings](/guides/excalidraw-docker-not-saving).

For production deployments, follow the guides for [OIDC and SSO setup](/guides/excalidraw-oidc-sso) (Authentik, Keycloak, Pocket ID, Authelia, Entra ID), [reverse proxy, HTTPS, and WebSockets](/guides/excalidraw-reverse-proxy) (Caddy, Nginx, Nginx Proxy Manager, Traefik, Cloudflare Tunnel), [PostgreSQL and S3/R2/MinIO storage](/guides/excalidraw-postgresql-s3), [Coolify, Portainer, and Dokploy](/deploy/coolify-portainer), and [Kubernetes, Proxmox, and Unraid](/deploy/kubernetes-proxmox-unraid).

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
