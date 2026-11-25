---
title: Self-Hosted Excalidraw Guides
description: Guides to self-host Excalidraw with Docker Compose, persistent storage, real-time collaboration, OIDC SSO, reverse proxies, PostgreSQL, and S3.
---

# Self-hosted Excalidraw guides

Practical setup and architecture guides for self-hosting Excalidraw on a server, homelab, or VPS with ExcaliDash.

## Getting started & comparisons

- [How to self-host Excalidraw](/guides/self-host-excalidraw): compare the official `excalidraw/excalidraw` image, `excalidraw-room`, and ExcaliDash, then deploy with Docker Compose.
- [How ExcaliDash works](/guides/how-excalidash-works): architecture of the Excalidraw backend, SQLite/PostgreSQL persistence, image interning, Socket.IO sync, and OIDC auth.
- [Self-hosted Excalidraw+ alternative](/guides/excalidraw-plus-alternative): compare ExcaliDash with Excalidraw+ and other open-source whiteboards, and migrate `.excalidraw` files.
- [Self-hosted Excalidraw projects compared](/guides/self-hosted-excalidraw-projects): ExcaliDash vs Excaliself, excalidraw-full, alswl/excalidraw-collaboration, excalidraw-persist, and AstraDraw.

## Collaboration & troubleshooting

- [Excalidraw collaboration server (`excalidraw-room`)](/guides/excalidraw-collaboration-server): run `excalidraw-room` in Docker, why `VITE_APP_WS_SERVER_URL` requires a rebuild, the HTTPS requirement, and a no-rebuild option.
- [Excalidraw Docker not saving drawings](/guides/excalidraw-docker-not-saving): why scenes vanish from the official Docker image and how to add server-side persistent storage.

## Production infrastructure

- [Reverse proxy, HTTPS & WebSockets](/guides/excalidraw-reverse-proxy): configs for Caddy, Nginx, Nginx Proxy Manager, Traefik v3, and Cloudflare Tunnel.
- [Excalidraw OIDC & SSO setup](/guides/excalidraw-oidc-sso): native OpenID Connect with Authentik, Keycloak, Pocket ID, Authelia, and Entra ID, including JIT provisioning and admin groups.
- [PostgreSQL & S3 storage](/guides/excalidraw-postgresql-s3): move beyond SQLite to PostgreSQL 16 and offload drawing images to AWS S3, Cloudflare R2, or MinIO.

## Deployment platforms & reference

- [Deploy with Docker Compose](/deploy/docker): production Compose workflow, pinned tags, scheduled SQLite backups, and upgrades.
- [Deploy on Coolify, Portainer & Dokploy](/deploy/coolify-portainer): standalone Compose stacks for web-based Docker panels.
- [Deploy on Kubernetes, Proxmox & Unraid](/deploy/kubernetes-proxmox-unraid): community Helm charts, Proxmox VE LXC script, Unraid Docker Compose setup, and the single-backend constraint.
- [Environment variables reference](/reference/environment): every backend and frontend setting in one table.
