# ExcaliDash

ExcaliDash is an open-source (LGPL-3.0) self-hosted Excalidraw workspace and Excalidraw+ alternative. It wraps the Excalidraw editor with persistent server-side storage, collections, built-in real-time collaboration, version history, and OIDC SSO in one Docker Compose stack, without running `excalidraw-room` or maintaining a custom frontend build.

The official `excalidraw/excalidraw` Docker image is a static frontend: scenes live only in browser localStorage, there are no accounts or folders, and live collaboration points to public servers unless you build and wire up a separate `excalidraw-room` backend.

[![ExcaliDash self-hosted Excalidraw workspace](docs/public/images/workspace.png)](https://excalidash.xyz)

Documentation and deployment guides live at **[excalidash.xyz](https://excalidash.xyz)**.

## Quick start

```sh
git clone https://github.com/ZimengXiong/ExcaliDash.git
cd ExcaliDash
docker compose -f docker-compose.prod.yml up -d
```

Open <http://localhost:6767> and create your administrator account.

## Requirements

- Docker Engine or Docker Desktop with Docker Compose v2
- Images: `zimengxiong/excalidash-frontend` and `zimengxiong/excalidash-backend` on Docker Hub for `linux/amd64` and `linux/arm64`, tagged `latest` and by release (current: `0.7.0`, matching [`VERSION`](VERSION))
- Ports: host `6767` maps to frontend container port `8080`; the backend listens on `8000` inside the Compose network and stays unexposed
- Storage: SQLite in the `backend-data` volume by default, or PostgreSQL; pasted images stored in the database by default or offloaded to any S3-compatible bucket
- Scaling: run a single backend instance (`replicas: 1`), since live collaboration room state lives in one Node.js process

## Excalidraw vs ExcaliDash

| Capability              | Official `excalidraw/excalidraw` | Official + `excalidraw-room`       | Excalidraw+       | ExcaliDash                          |
| ----------------------- | -------------------------------- | ---------------------------------- | ----------------- | ----------------------------------- |
| Hosting                 | Self-hosted static frontend      | Self-hosted, custom frontend build | Hosted SaaS only  | Self-hosted Docker Compose          |
| Saved drawings          | Browser `localStorage`           | Browser `localStorage`             | Cloud workspace   | SQLite or PostgreSQL, optional S3   |
| Real-time collaboration | Public Excalidraw servers        | Your `excalidraw-room` server      | Yes               | Built-in Socket.IO on `/socket.io/` |
| Accounts, folders, SSO  | No                               | No                                 | Yes               | Local accounts, collections, OIDC   |
| Version history         | No                               | No                                 | Yes               | Automatic snapshots with restore    |
| License and cost        | MIT, free                        | MIT, free                          | Paid subscription | LGPL-3.0, free                      |

## Guides & documentation

- **[How to self-host Excalidraw](https://excalidash.xyz/guides/self-host-excalidraw)**: compare the official image, `excalidraw-room`, and ExcaliDash, then deploy with Docker Compose
- **[How ExcaliDash works](https://excalidash.xyz/guides/how-excalidash-works)**: architecture of the Excalidraw backend, SQLite/PostgreSQL persistence, image interning, Socket.IO sync, and OIDC auth
- **[Self-hosted Excalidraw projects compared](https://excalidash.xyz/guides/self-hosted-excalidraw-projects)**: ExcaliDash vs Excaliself, excalidraw-full, alswl/excalidraw-collaboration, excalidraw-persist, and AstraDraw
- **[Self-host Excalidraw collaboration](https://excalidash.xyz/guides/excalidraw-collaboration-server)**: `excalidraw-room` in Docker, why `VITE_APP_WS_SERVER_URL` needs a rebuild, and the no-rebuild alternative
- **[Excalidraw Docker not saving drawings](https://excalidash.xyz/guides/excalidraw-docker-not-saving)**: why the official container loses scenes and how to add persistent storage
- **[Self-hosted Excalidraw+ alternative](https://excalidash.xyz/guides/excalidraw-plus-alternative)**: feature comparison with Excalidraw+ and migrating `.excalidraw` files
- **[Reverse proxy, HTTPS & WebSockets](https://excalidash.xyz/guides/excalidraw-reverse-proxy)**: Caddy, Nginx, Nginx Proxy Manager, Traefik, and Cloudflare Tunnel
- **[Excalidraw OIDC & SSO setup](https://excalidash.xyz/guides/excalidraw-oidc-sso)**: Authentik, Keycloak, Pocket ID, Authelia, and Entra ID
- **[PostgreSQL & S3 storage](https://excalidash.xyz/guides/excalidraw-postgresql-s3)**: PostgreSQL 16, AWS S3, Cloudflare R2, and MinIO
- **[Docker Compose production guide](https://excalidash.xyz/deploy/docker)**: pinned tags, scheduled SQLite backups, and upgrades
- **[Coolify, Portainer & Dokploy](https://excalidash.xyz/deploy/coolify-portainer)**: standalone stacks for Docker panels
- **[Kubernetes, Proxmox & Unraid](https://excalidash.xyz/deploy/kubernetes-proxmox-unraid)**: community Helm charts, Proxmox LXC, and Unraid
- **[Environment variables reference](https://excalidash.xyz/reference/environment)**: complete backend and frontend settings

ExcaliDash is an independent open-source project built around Excalidraw and is not affiliated with Excalidraw. Licensed under the GNU Lesser General Public License v3.0.
