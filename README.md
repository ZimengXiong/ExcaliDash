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

## Kimi AI agent

This fork adds a built-in AI agent powered by [Kimi](https://www.moonshot.ai/). The agent can discuss the current drawing and create, update, or remove diagram elements. Each drawing has a persistent AI conversation.

Users who have access to the same drawing share its AI conversation and can follow the agent's activity in real time. New messages, reasoning and status updates, and conversation resets are delivered to connected participants using Server-Sent Events (SSE), without requiring a page refresh. The conversation is shared at the drawing level rather than private to an individual user.

To enable the agent, create a `.env` file in the repository root, next to `docker-compose.yml` and `docker-compose.prod.yml`:

```dotenv
# Required: your Moonshot API key. It is passed only to the backend.
KIMI_API_KEY=your_moonshot_api_key

# Optional: these are the default values.
KIMI_BASE_URL=https://api.moonshot.ai/v1
KIMI_MODEL=kimi-k3.1-pro
# Allowed values: low, high, max
KIMI_REASONING_EFFORT=high
# Maximum time to wait for a response, in milliseconds.
KIMI_TIMEOUT_MS=180000
```

Only `KIMI_API_KEY` is required. After changing the file, recreate the containers:

```sh
docker compose -f docker-compose.prod.yml up -d
```

Open a drawing and click **AI** in the top-right corner of the canvas. You can ask the agent to build a new diagram or refine the existing one, for example:

> Create a frame showing the React component lifecycle, with clear labels and arrows.

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
