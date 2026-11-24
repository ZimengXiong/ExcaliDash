# ExcaliDash

Self-hosted Excalidraw workspace with persistent drawings, collections, built-in real-time collaboration, version history, backups, and local or OpenID Connect (OIDC) SSO authentication.

[![ExcaliDash self-hosted Excalidraw workspace](docs/public/images/workspace.png)](https://excalidash.xyz)

Full documentation and deployment guides live at **[excalidash.xyz](https://excalidash.xyz)**.

## Quick start

```sh
git clone https://github.com/ZimengXiong/ExcaliDash.git
cd ExcaliDash
docker compose -f docker-compose.prod.yml up -d
```

Open <http://localhost:6767> and create your administrator account.

## Guides & documentation

- **[How to self-host Excalidraw](https://excalidash.xyz/guides/self-host-excalidraw)** — official container vs `excalidraw-room` vs ExcaliDash, standalone Compose, and troubleshooting
- **[Self-hosted Excalidraw+ alternative](https://excalidash.xyz/guides/excalidraw-plus-alternative)** — feature comparison and migrating `.excalidraw` files
- **[Reverse proxy, HTTPS & WebSockets](https://excalidash.xyz/guides/excalidraw-reverse-proxy)** — Caddy, Nginx, Nginx Proxy Manager, Traefik, and Cloudflare Tunnel
- **[OIDC & SSO setup](https://excalidash.xyz/guides/excalidraw-oidc-sso)** — Authentik, Keycloak, Pocket ID, Authelia, and Entra ID
- **[PostgreSQL & S3 storage](https://excalidash.xyz/guides/excalidraw-postgresql-s3)** — PostgreSQL 16, AWS S3, Cloudflare R2, and MinIO
- **[Coolify, Portainer & Dokploy](https://excalidash.xyz/deploy/coolify-portainer)** — standalone templates for self-hosted panels
- **[Docker Compose production guide](https://excalidash.xyz/deploy/docker)** — pinned releases, scheduled backups, and upgrades
- **[Environment variables reference](https://excalidash.xyz/reference/environment)** — complete configuration reference

ExcaliDash is an independent open-source project built around Excalidraw and is not affiliated with Excalidraw. Licensed under the GNU Lesser General Public License v3.0.
