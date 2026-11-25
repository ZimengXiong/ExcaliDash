---
title: "How to Self-Host Excalidraw (2026): Docker Compose, Saving & Collaboration"
description: Self-host Excalidraw with persistent storage and live collaboration using Docker Compose. Compare the official image, excalidraw-room, and ExcaliDash.
---

# How to self-host Excalidraw (2026): Docker Compose, saving, and collaboration

To self-host Excalidraw with saved drawings and real-time collaboration, deploy ExcaliDash with Docker Compose: a frontend container, a Node.js backend, and a persistent SQLite volume. Drawings write to your database instead of browser `localStorage`, and multiplayer sync stays on your own `/socket.io/` server without running `excalidraw-room` or rebuilding the frontend.

Running `docker run -p 5000:80 excalidraw/excalidraw:latest` gives you a working canvas, then runs into three limits. First, the official image is static files served by nginx, so scenes live only in one browser's `localStorage` and disappear when you clear site data or switch machines unless you manually download `.excalidraw` files. Second, upstream builds compile `oss-collab.excalidraw.com` into the JavaScript bundle, sending live collaboration traffic off your network. Third, there is no drawing list, folder hierarchy, search, version history, or user authentication.

This guide compares the three self-hosting options and walks through a production Docker Compose deployment with ExcaliDash. For other GitHub projects (Excaliself, excalidraw-full, alswl/excalidraw-collaboration, excalidraw-persist), see [self-hosted Excalidraw projects compared](/guides/self-hosted-excalidraw-projects). For running upstream `excalidraw-room`, see [self-host Excalidraw collaboration](/guides/excalidraw-collaboration-server).

## Comparing the 3 ways to self-host Excalidraw

| Approach                               | Server-side saved drawings               | Self-hosted real-time collaboration                          | Collections, accounts & SSO     | Maintenance effort |
| -------------------------------------- | ---------------------------------------- | ------------------------------------------------------------ | ------------------------------- | ------------------ |
| Official `excalidraw/excalidraw` image | No (browser `localStorage` only)         | No (points to public collab server)                          | No                              | Low                |
| `excalidraw` + `excalidraw-room`       | No (ephemeral rooms, manual file export) | Yes (requires custom frontend build with overridden WS URLs) | No                              | High               |
| ExcaliDash (Docker Compose)            | Yes (SQLite or PostgreSQL + optional S3) | Yes (built-in Socket.IO backend + follow mode)               | Yes (local accounts + OIDC SSO) | Low                |

Pick the official `excalidraw/excalidraw` container for a local scratchpad where you save `.excalidraw` files to disk manually. Pick `excalidraw` + `excalidraw-room` if you want anonymous, end-to-end encrypted rooms with no accounts or database and are fine rebuilding the frontend on each upstream release. Pick ExcaliDash when you want persistent storage across devices, collections, team accounts or OIDC SSO, version history, and self-hosted live collaboration in one Compose stack.

## How the ExcaliDash Docker stack fits together

ExcaliDash runs two containers on a private Docker bridge network. The `frontend` container (`zimengxiong/excalidash-frontend`) serves the React dashboard and embedded Excalidraw editor on container ports `8080` and `80`, proxying `/api/*` and `/socket.io/*` internally to `backend:8000`. The `backend` container (`zimengxiong/excalidash-backend`) runs the Express API, SQLite or PostgreSQL database layer, Socket.IO collaboration server, snapshot history, scheduled backups, and OIDC client.

Because the frontend proxies API and WebSocket traffic internally, your reverse proxy only points at one port (`6767` on the host, or `8080` on a shared Docker network). See [how ExcaliDash works](/guides/how-excalidash-works) for the full backend architecture.

## Step 1: Create `docker-compose.yml`

Save this standalone `docker-compose.yml` on your server, VPS, or homelab (no Git clone needed):

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

For local-only testing over HTTP without a reverse proxy, drop `FRONTEND_URL` and set `TRUST_PROXY` to `"false"`.

## Step 2: Generate signing secrets and start the stack

Put persistent `JWT_SECRET` and `CSRF_SECRET` values in a `.env` file next to `docker-compose.yml` so active sessions survive container rebuilds and host migrations:

```bash
cat <<EOF > .env
JWT_SECRET=$(openssl rand -hex 32)
CSRF_SECRET=$(openssl rand -hex 32)
EOF

docker compose up -d
docker compose ps
```

Open `http://localhost:6767` (or your HTTPS domain) and finish [first-run setup](/guide/first-run#create-the-administrator) to create the administrator account.

## Step 3: Add HTTPS and WebSockets with a reverse proxy

Live collaboration requires WebSocket upgrades on `/socket.io/`. With Caddy, three lines handle TLS and WebSockets:

```txt
draw.example.com {
    reverse_proxy 127.0.0.1:6767
}
```

For Nginx, Nginx Proxy Manager, Traefik v3, Cloudflare Tunnel, and multi-hop `TRUST_PROXY` setups, see the [reverse proxy and HTTPS guide](/guides/excalidraw-reverse-proxy).

## Step 4: Verify persistence and live collaboration

1. Create a drawing, add a few shapes, close the tab, then sign in from another browser or an incognito window and reopen it to verify persistence.
2. Add a second account under Admin → New User, open the drawing's Share dialog, grant Edit access, and open the drawing in both sessions. Named cursors, header avatars, and shape updates sync immediately, and clicking a collaborator's avatar follows their viewport.
3. Drag existing `.excalidraw` files onto the dashboard or use the import dialog to bring in scenes from `excalidraw.com`.

## Step 5: Backups, OIDC SSO, PostgreSQL, or PaaS panels

To add scheduled SQLite backups, mount `backup-data:/app/backups` (owned by UID `1001`) and set `BACKUP_SCHEDULE="0 0 4 * * *"` as covered in [Persist and back up data](/deploy/docker#persist-and-back-up-data). To enable SSO with Authentik, Keycloak, Pocket ID, Authelia, or Entra ID, set `AUTH_MODE` to `hybrid` or `oidc_enforced` following [Excalidraw OIDC & SSO setup](/guides/excalidraw-oidc-sso).

If you want PostgreSQL 16 and S3-compatible image storage (MinIO, Cloudflare R2, AWS S3), see [PostgreSQL & S3 storage](/guides/excalidraw-postgresql-s3). For panel and cluster setups, see [Coolify, Portainer & Dokploy](/deploy/coolify-portainer) or [Kubernetes, Proxmox & Unraid](/deploy/kubernetes-proxmox-unraid).

## Where does self-hosted Excalidraw save drawings?

The official `excalidraw/excalidraw` image stores scenes only in the browser's `localStorage` and IndexedDB for that origin and browser profile. Nothing is sent to the server, so clearing site data, switching devices, or changing the URL loses the canvas. See [why self-hosted Excalidraw doesn't save drawings](/guides/excalidraw-docker-not-saving).

ExcaliDash writes every drawing to the backend database. By default that is SQLite at `/app/prisma/dev.db` inside the `backend-data` volume, with pasted images stored in the database or offloaded to an S3-compatible bucket when `S3_BUCKET` is set. Switch to PostgreSQL with `DATABASE_PROVIDER=postgresql`.

## Backups

For SQLite, set `BACKUP_SCHEDULE` (5- or 6-field cron), `BACKUP_DIR`, and `BACKUP_RETENTION_DAYS`, and mount a `backup-data` volume owned by UID `1001`. ExcaliDash runs SQLite `VACUUM INTO` so backups stay consistent without pausing writes. See [Persist and back up data](/deploy/docker#persist-and-back-up-data).

For PostgreSQL, use `pg_dump` or managed database snapshots; the built-in scheduler only covers SQLite. See [PostgreSQL & S3 backups](/guides/excalidraw-postgresql-s3#backups-and-migration).

You can also download a full `.excalidash` workspace archive (drawings, collections, version history, and uploaded images) under Settings → Export backup. Keep `JWT_SECRET`, `CSRF_SECRET`, and `API_KEY_HASH_PEPPER` backed up outside the container volume.

## Upgrading and pinning Docker image tags

Docker Hub publishes multi-arch images (`linux/amd64` and `linux/arm64`) as `latest` and pinned version tags such as `0.7.0`. Pin both services to the same tag in production:

```yaml
services:
  backend:
    image: zimengxiong/excalidash-backend:0.7.0
  frontend:
    image: zimengxiong/excalidash-frontend:0.7.0
```

To upgrade, take a backup, bump both tags together, and run:

```bash
docker compose pull
docker compose up -d
```

Database migrations run automatically on backend startup. If you use the repository's `docker-compose.prod.yml`, set `EXCALIDASH_TAG` in `.env` instead of editing image lines.

## Does self-hosted Excalidraw require HTTPS?

For single-user testing on `localhost`, no. Over a LAN or the internet, yes:

- Upstream Excalidraw's end-to-end encrypted rooms rely on the Web Crypto API (`crypto.subtle`), which browsers only expose on `https://` origins and `localhost`. Plain `http://` on a LAN IP breaks official collaboration.
- ExcaliDash marks session cookies `Secure` when `FRONTEND_URL` starts with `https://` and relies on `TRUST_PROXY` to detect forwarded HTTPS. Mismatched settings cause sign-in redirect loops behind a proxy.

Terminate TLS at Caddy, Nginx, Traefik, or Cloudflare Tunnel and forward WebSocket upgrades on `/socket.io/`. See [Reverse proxy, HTTPS & WebSockets](/guides/excalidraw-reverse-proxy).

## Common self-hosting pitfalls

| Issue                                         | Cause and fix                                                                                                          |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Canvas loads, edits do not sync               | Reverse proxy is not forwarding `Upgrade` and `Connection: upgrade` on `/socket.io/`, or `FRONTEND_URL` does not match |
| Sign-in bounces back to `/login` behind HTTPS | `TRUST_PROXY` is still `"false"` or set to the wrong hop count, so the backend does not detect forwarded HTTPS         |
| Permission errors on bind mounts              | The backend runs as non-root UID `1001`; use Docker named volumes or run `chown -R 1001:1001` on host bind-mount paths |

## Frequently asked questions

### Does the official Excalidraw Docker image save drawings?

No. `excalidraw/excalidraw` ships no backend or database; drawings remain in your browser's `localStorage` until you manually export a `.excalidraw` file. ExcaliDash persists drawings in SQLite or PostgreSQL on your server.

### Do I need `excalidraw-room` alongside ExcaliDash?

No. `excalidash-backend` includes its own Socket.IO collaboration server on `/socket.io/`. You do not need `excalidraw-room`, Firebase, or any third-party signaling service.

### Can ExcaliDash run offline or on an air-gapped LAN?

Yes. Frontend assets, fonts, and both database clients (SQLite and PostgreSQL) are bundled into the Docker images. Set `AUTH_MODE=local` (or `disabled` on an isolated single-user network) and run with no internet access once images are pulled.
