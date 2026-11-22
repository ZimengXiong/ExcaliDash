# ExcaliDash — Self-Hosted Excalidraw Workspace

Open-source, self-hosted **Excalidraw** dashboard and **Excalidraw+ alternative** with persistent server-side drawings, collections, built-in real-time collaboration, version history, backups, and local or OpenID Connect (OIDC) SSO authentication.

[![ExcaliDash self-hosted Excalidraw dashboard](docs/public/images/workspace.png)](https://excalidash.xyz)

- **Documentation:** [excalidash.xyz](https://excalidash.xyz)
- **Self-hosting guide:** [How to self-host Excalidraw with Docker Compose](https://excalidash.xyz/guides/self-host-excalidraw)
- **Comparison:** [Self-hosted Excalidraw+ alternative](https://excalidash.xyz/guides/excalidraw-plus-alternative)
- **Team SSO:** [Excalidraw with OIDC / SSO (Authentik, Keycloak, Pocket ID)](https://excalidash.xyz/guides/excalidraw-oidc-sso)

## Why ExcaliDash instead of the official `excalidraw/excalidraw` image?

The official `excalidraw/excalidraw` Docker image is a static frontend: scenes live only in browser `localStorage`, there are no accounts or folders, and live collaboration points to public servers unless you build and wire up a separate `excalidraw-room` backend.

| Capability                      | `excalidraw/excalidraw`                   | ExcaliDash                                                 |
| ------------------------------- | ----------------------------------------- | ---------------------------------------------------------- |
| Persistent server-side drawings | Browser `localStorage` only               | SQLite or PostgreSQL + optional S3                         |
| Real-time collaboration         | Public server or custom `excalidraw-room` | Built-in Socket.IO backend + follow mode                   |
| Dashboard, collections & search | No                                        | Yes                                                        |
| User accounts & OIDC SSO        | No                                        | Local accounts + OIDC (Authentik, Keycloak, Pocket ID)     |
| Drawing & collection sharing    | Anonymous room links                      | Scoped account permissions + expiring view/edit links      |
| Version history & backups       | Manual `.excalidraw` export               | Automatic snapshots + `.excalidash` & `.excalidraw` export |

## Quick start (Docker Compose)

```sh
git clone https://github.com/ZimengXiong/ExcaliDash.git
cd ExcaliDash
docker compose -f docker-compose.prod.yml up -d
```

Or drop a standalone `docker-compose.yml` anywhere without cloning:

```yaml
services:
  backend:
    image: zimengxiong/excalidash-backend:latest
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
    ports:
      - "6767:8080"
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  backend-data:
```

Open <http://localhost:6767> and create your first administrator account.

## Features

- **Persistent workspace:** Save Excalidraw drawings to SQLite (zero-config default) or PostgreSQL, with local or S3-compatible image storage (MinIO, Cloudflare R2, AWS S3).
- **Real-time collaboration:** Built-in Socket.IO sync with named cursors, presence avatars, and viewport follow mode—all on your own server.
- **Organization & sharing:** Group drawings into collections, search and sort across devices, and share drawings or collections with view/edit permissions or expiring public links.
- **Authentication & SSO:** Local email/password accounts, `hybrid` or `oidc_enforced` OpenID Connect (Authentik, Keycloak, Pocket ID, Authelia), group-to-admin mapping, and scoped REST/Socket.IO API keys.
- **Version history & portable backups:** Automatic drawing snapshots with two-click restore, scheduled SQLite backups, standard `.excalidraw` import/export, and full `.excalidash` library archives.

## Documentation

- [How to self-host Excalidraw](https://excalidash.xyz/guides/self-host-excalidraw)
- [Docker Compose deployment, HTTPS (Caddy, Nginx, Traefik) & backups](https://excalidash.xyz/deploy/docker)
- [Real-time collaboration & WebSocket proxy setup](https://excalidash.xyz/guide/collaboration)
- [Authentication & OIDC SSO](https://excalidash.xyz/guide/authentication)
- [Storage, version history & backups](https://excalidash.xyz/guide/storage-backups)
- [Environment variables reference](https://excalidash.xyz/reference/environment)

ExcaliDash is an independent open-source project built around Excalidraw and is not affiliated with Excalidraw. Licensed under the GNU Lesser General Public License v3.0.
