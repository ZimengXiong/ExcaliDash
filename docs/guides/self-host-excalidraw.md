---
title: How to Self-Host Excalidraw
description: Compare the official Excalidraw Docker image, excalidraw-room, and ExcaliDash. Deploy self-hosted Excalidraw with saved drawings and live collab.
---

# How to self-host Excalidraw with collaboration and saved drawings

If you run `docker run -p 5000:80 excalidraw/excalidraw:latest`, you quickly hit three limits:

1. **Drawings are not saved on the server.** The official container is a static frontend; scenes persist only inside a single browser's `localStorage`. Clearing site data or switching devices loses your work unless you manually download `.excalidraw` files.
2. **Live collaboration still hits Excalidraw's public servers.** The upstream Vite bundle bakes `oss-collab.excalidraw.com` into the frontend build, so self-hosting the frontend container alone does not keep real-time rooms on your infrastructure.
3. **No workspace layer.** There is no dashboard, folder structure, search across drawings, version history, or user authentication.

This guide compares the three ways to self-host Excalidraw and walks through deploying a complete, persistent, collaborative Excalidraw stack with Docker Compose using **ExcaliDash**.

## Comparing the 3 ways to self-host Excalidraw

| Approach                               | Server-side saved drawings                   | Self-hosted real-time collaboration                          | Collections, accounts & SSO         | Maintenance effort |
| -------------------------------------- | -------------------------------------------- | ------------------------------------------------------------ | ----------------------------------- | ------------------ |
| Official `excalidraw/excalidraw` image | No (browser `localStorage` only)             | No (points to public collab server)                          | No                                  | Low                |
| `excalidraw` + `excalidraw-room`       | No (ephemeral rooms, manual file export)     | Yes (requires custom frontend build with overridden WS URLs) | No                                  | High               |
| **ExcaliDash** (Docker Compose)        | **Yes** (SQLite or PostgreSQL + optional S3) | **Yes** (built-in Socket.IO backend + follow mode)           | **Yes** (local accounts + OIDC SSO) | **Low**            |

- **Pick the official `excalidraw/excalidraw` container** if you only want a private, tracker-free scratchpad and always save `.excalidraw` files manually to disk.
- **Pick `excalidraw` + `excalidraw-room`** if you strictly want anonymous, ephemeral whiteboard rooms with no accounts or database and are willing to maintain a custom frontend build.
- **Pick ExcaliDash** if you want a persistent Excalidraw dashboard where drawings save to your own database, organize into collections, sync across devices, and support live multi-user collaboration on your own backend.

## Architecture of a self-hosted ExcaliDash stack

ExcaliDash runs as two containers on a private Docker bridge network:

- **`frontend`** (`zimengxiong/excalidash-frontend`) — serves the web UI and embedded Excalidraw editor on container port `8080` (and `80`), and proxies REST API calls (`/api/*`) and Socket.IO WebSockets (`/socket.io/*`) to `backend:8000`.
- **`backend`** (`zimengxiong/excalidash-backend`) — Node.js API, Prisma ORM (SQLite by default, or PostgreSQL), Socket.IO collaboration engine, snapshot scheduler, and OIDC client.

Because the frontend proxies `/api/` and `/socket.io/` internally, your reverse proxy only needs to point at one port (`6767` on the host, or `8080` on a shared Docker network).

## Step 1: Create `docker-compose.yml`

Save this standalone `docker-compose.yml` on your server, VPS, or homelab (no Git clone required):

```yaml
services:
  backend:
    image: zimengxiong/excalidash-backend:0.7.0
    container_name: excalidash-backend
    init: true
    environment:
      DATABASE_PROVIDER: sqlite
      DATABASE_URL: file:/app/prisma/dev.db
      PORT: 8000
      NODE_ENV: production
      AUTH_MODE: local
      FRONTEND_URL: https://draw.example.com
      TRUST_PROXY: "1"
      JWT_SECRET: ${JWT_SECRET}
      CSRF_SECRET: ${CSRF_SECRET}
    volumes:
      - backend-data:/app/prisma
    networks:
      - excalidash-network
    restart: unless-stopped
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "require('http').get('http://127.0.0.1:8000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))",
        ]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    image: zimengxiong/excalidash-frontend:0.7.0
    container_name: excalidash-frontend
    ports:
      - "6767:8080"
    depends_on:
      - backend
    networks:
      - excalidash-network
    restart: unless-stopped

networks:
  excalidash-network:
    driver: bridge

volumes:
  backend-data:
```

For local-only testing over HTTP without a reverse proxy, remove `FRONTEND_URL` and change `TRUST_PROXY` to `"false"`.

## Step 2: Generate signing secrets and start the stack

Generate persistent `JWT_SECRET` and `CSRF_SECRET` values in a `.env` file next to `docker-compose.yml` so sessions survive container rebuilds and server migrations:

```bash
cat <<EOF > .env
JWT_SECRET=$(openssl rand -hex 32)
CSRF_SECRET=$(openssl rand -hex 32)
EOF

docker compose up -d
docker compose ps
```

Open `http://localhost:6767` (or your configured HTTPS domain) and follow [first-run setup](/guide/first-run#create-the-administrator) to create your administrator account.

## Step 3: Put HTTPS and WebSockets in front of ExcaliDash

Real-time collaboration requires WebSocket upgrades on `/socket.io/`. A minimal Caddyfile looks like this:

```txt
draw.example.com {
    reverse_proxy 127.0.0.1:6767
}
```

For complete Nginx, Nginx Proxy Manager, Traefik v3, and Cloudflare Tunnel configs—plus multi-hop `TRUST_PROXY` settings—see the [reverse proxy and HTTPS guide](/guides/excalidraw-reverse-proxy).

## Step 4: Verify persistence and real-time collaboration

1. **Persistence check:** Create a drawing, draw a few shapes, close the tab, and reopen it from a second browser or incognito window after signing in.
2. **Collaboration check:** Create a second user under **Admin → New User**, open the drawing's **Share** dialog, grant **Edit** access, and open the same drawing in two windows. You should see live named cursors, header presence avatars, and instant element sync. Click a collaborator's avatar to test viewport follow mode.
3. **Import existing files:** Drag any `.excalidraw` file onto the dashboard or use the import dialog to bring in existing diagrams from `excalidraw.com`.

## Step 5: Configure backups, SSO, or PostgreSQL

- **Scheduled SQLite backups:** Mount a `backup-data:/app/backups` volume owned by UID `1001` and set `BACKUP_SCHEDULE="0 0 4 * * *"`. See [Persist and back up data](/deploy/docker#persist-and-back-up-data).
- **Team SSO:** Switch `AUTH_MODE` to `hybrid` or `oidc_enforced` to sign in through Authentik, Keycloak, Pocket ID, or Authelia. See the [OIDC & SSO guide](/guides/excalidraw-oidc-sso).
- **PostgreSQL & S3 storage:** Replace SQLite with PostgreSQL 16 and offload uploaded images to MinIO, Cloudflare R2, or AWS S3. See the [PostgreSQL & S3 guide](/guides/excalidraw-postgresql-s3).
- **Panel deployments:** Running Coolify, Portainer, or Dokploy? Use the [panel deployment templates](/deploy/coolify-portainer).

## Common self-hosting pitfalls

- **Collaboration loads the canvas but edits don't sync:** Your reverse proxy is missing `Upgrade` / `Connection: upgrade` headers for `/socket.io/`, or `FRONTEND_URL` does not match the exact browser origin (including `https://`).
- **Sign-in loops behind HTTPS:** `TRUST_PROXY` is still `"false"` (or wrong hop count), so the backend does not recognize the request as HTTPS when setting `Secure` session cookies.
- **Bind-mount permission errors:** The backend container runs as non-root UID `1001`. Prefer Docker named volumes, or run `chown -R 1001:1001` on host bind-mount directories.

## Frequently asked questions

### Does the official Excalidraw Docker image save drawings?

No. `excalidraw/excalidraw` has no backend or database; drawings stay only in your browser's `localStorage` until you manually export a `.excalidraw` file. ExcaliDash stores drawings in SQLite or PostgreSQL on your server.

### Do I need to run `excalidraw-room` alongside ExcaliDash?

No. ExcaliDash includes its own Socket.IO collaboration server inside `excalidash-backend`. You do not need `excalidraw-room`, Firebase, or any external signaling service.

### Can ExcaliDash run completely offline or on an air-gapped LAN?

Yes. ExcaliDash bundles its frontend assets and fonts inside the container images. Set `AUTH_MODE=local` (or `disabled` on an isolated single-user network) and run without external internet access once images are pulled.
