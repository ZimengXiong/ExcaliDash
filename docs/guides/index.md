---
title: Self-Hosted Excalidraw Guides
description: Step-by-step guides to self-host Excalidraw with Docker Compose, real-time collaboration, OIDC SSO, reverse proxies, PostgreSQL, and S3.
---

# Self-hosted Excalidraw guides

Practical setup guides for running Excalidraw on your own server, homelab, or VPS with ExcaliDash.

## Getting started & comparisons

- [How to self-host Excalidraw](/guides/self-host-excalidraw) — compare the official `excalidraw/excalidraw` image, `excalidraw-room`, and ExcaliDash, then deploy with Docker Compose.
- [Self-hosted Excalidraw+ alternative](/guides/excalidraw-plus-alternative) — compare ExcaliDash with Excalidraw+ and other open-source whiteboards, and migrate existing `.excalidraw` files.

## Production infrastructure

- [Reverse proxy, HTTPS & WebSockets](/guides/excalidraw-reverse-proxy) — complete configs for Caddy, Nginx, Nginx Proxy Manager, Traefik, and Cloudflare Tunnel.
- [OIDC & SSO setup](/guides/excalidraw-oidc-sso) — native OpenID Connect sign-in with Authentik, Keycloak, Pocket ID, Authelia, and Entra ID, including JIT provisioning and admin groups.
- [PostgreSQL & S3 storage](/guides/excalidraw-postgresql-s3) — move beyond SQLite to PostgreSQL 16 and store drawing images on AWS S3, Cloudflare R2, or MinIO.

## Deployment panels & reference

- [Deploy with Docker Compose](/deploy/docker) — production Compose workflow, pinned releases, scheduled backups, and upgrades.
- [Deploy on Coolify, Portainer & Dokploy](/deploy/coolify-portainer) — standalone Compose stacks for web-based Docker panels.
- [Environment variables reference](/reference/environment) — every backend and frontend setting in one table.
