---
title: How to Self-Host Excalidraw with Docker Compose
description: Step-by-step guide to self-host Excalidraw with Docker Compose using ExcaliDash. Includes persistent SQLite or PostgreSQL storage, HTTPS reverse proxy (Caddy, Nginx, Traefik), WebSockets, and backups.
---

<script setup>
import { setupSlides } from "../.vitepress/theme/screenshot-flows";
</script>

# How to self-host Excalidraw with Docker Compose

Run a self-hosted Excalidraw workspace with saved drawings, collections, and real-time collaboration on your server, VPS, or homelab using ExcaliDash's production Docker Compose stack (`frontend` + `backend` + persistent SQLite volume).

## Prerequisites

- Docker Engine (or Docker Desktop) and Docker Compose v2
- Git
- Host port `6767` available (or customize the mapping in an override)
- A domain name and HTTPS reverse proxy if exposing ExcaliDash over the internet

## Install ExcaliDash

Clone the repository and start the stack:

```bash
git clone https://github.com/ZimengXiong/ExcaliDash.git
cd ExcaliDash
docker compose -f docker-compose.prod.yml up -d
```

Open `http://localhost:6767` (or your server's IP/hostname), then complete [first-run setup](/guide/first-run#create-the-administrator) to create the administrator account.

<ScreenshotCarousel label="First-run setup after Docker deployment" :slides="setupSlides" />

Verify both containers are healthy:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=100
```

Create a test drawing, close it, and reopen it to verify persistence. To test real-time collaboration, share the drawing with a second account with edit access and open both sessions side by side.

## Pin an image version

Set `EXCALIDASH_TAG` in a `.env` file next to `docker-compose.prod.yml` so frontend and backend always stay on the same release:

```dotenv
EXCALIDASH_TAG=latest
```

Pin an explicit version tag (for example `0.6.10`) in production for repeatable deployments, then pull and recreate:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

## Configure HTTPS

Terminate TLS at your reverse proxy (Caddy, Nginx, Traefik, etc.) and proxy traffic to host port `6767` (or directly to container port `80` or `8080` on a shared Docker network—both ports serve the same frontend). The frontend nginx container proxies API requests and WebSockets to the backend while preserving the incoming `Host` header and port.

Create `compose.override.yml` with your public origin and trusted proxy hop count:

```yaml
services:
  backend:
    environment:
      FRONTEND_URL: https://draw.example.com
      TRUST_PROXY: "1"
```

Replace `https://draw.example.com` with your real URL. Your proxy must sanitize client-supplied `X-Forwarded-*` headers and forward WebSocket upgrades for `/socket.io/`.

Apply the override:

```bash
docker compose -f docker-compose.prod.yml -f compose.override.yml up -d
```

### Reverse proxy examples

::: code-group

```txt [Caddy]
draw.example.com {
    reverse_proxy 127.0.0.1:6767
}
```

```nginx [Nginx]
server {
    listen 443 ssl http2;
    server_name draw.example.com;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:6767;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```yaml [Traefik labels]
services:
  frontend:
    labels:
      - traefik.enable=true
      - traefik.http.routers.excalidash.rule=Host(`draw.example.com`)
      - traefik.http.routers.excalidash.entrypoints=websecure
      - traefik.http.routers.excalidash.tls.certresolver=letsencrypt
      - traefik.http.services.excalidash.loadbalancer.server.port=8080
```

:::

## Non-root port binding

The frontend runs as the unprivileged `nginx` user and listens on both `8080` and `80`. Most modern Docker installations allow binding port `80` inside the container namespace without root. If your Docker runtime restricts privileged ports, add this override to keep nginx non-root:

```yaml
services:
  frontend:
    sysctls:
      net.ipv4.ip_unprivileged_port_start: "0"
```

This sysctl only affects the container's own network namespace.

## Persist and back up data

The `backend-data` volume holds your SQLite database, locally stored images, and auto-generated signing secrets. Scheduled backups copy the SQLite database—store `JWT_SECRET`, `CSRF_SECRET`, and `API_KEY_HASH_PEPPER` separately.

Enable daily SQLite backups at 04:00 (container time) in `compose.override.yml`:

```yaml
services:
  backend:
    environment:
      BACKUP_SCHEDULE: "0 0 4 * * *"
      BACKUP_DIR: /app/backups
      BACKUP_RETENTION_DAYS: "14"
    volumes:
      - backup-data:/app/backups
volumes:
  backup-data:
```

Give the backend user (`UID 1001`) ownership of the backup volume before starting:

```bash
docker compose -f docker-compose.prod.yml -f compose.override.yml run --rm --no-deps --user 0 --entrypoint sh backend -c 'chown 1001:1001 /app/backups'
docker compose -f docker-compose.prod.yml -f compose.override.yml up -d
```

Check backend logs after the first scheduled run and periodically test a restore. For PostgreSQL deployments, use `pg_dump` or managed snapshots; if S3 is configured, back up your bucket as well.

### Account exports and recovery copies

**Settings → Export backup** downloads a `.excalidash` archive containing your drawings, collections, drawing history, and deduplicated uploaded images. External image URLs stay as links and still depend on their original host.

If an uploaded image is missing from storage, a normal export fails and offers **Export Recovery Copy** instead. A recovery copy packages all available drawings, history, and images, and records the missing image references in the archive manifest so you know what could not be saved. Storage outages and corrupt files still fail both modes.

## Upgrade

Back up first, update `EXCALIDASH_TAG` if pinned, then pull and restart:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

## Troubleshooting

### Site does not open

Run `docker compose -f docker-compose.prod.yml ps` and inspect `logs`. Confirm host port `6767` is reachable and not blocked by a firewall. Remember that `localhost` always refers to the machine where your browser runs.

### Real-time collaboration does not sync

Confirm your reverse proxy forwards WebSocket upgrades on `/socket.io/`, `FRONTEND_URL` matches your browser URL (scheme + host + non-default port if any), and `TRUST_PROXY` matches your proxy hop count. Check that the collaborator has edit permission.

### Data or backup permission errors

Prefer named Docker volumes for `/app/prisma` and `/app/backups`. If using host bind mounts, ensure `UID 1001` has read/write ownership. For the backup volume, run the `chown 1001:1001 /app/backups` command shown above.

## Stop safely

```bash
docker compose -f docker-compose.prod.yml down
```

Stopping containers leaves `backend-data` intact. Do not pass `--volumes` unless you intend to delete all stored drawings and accounts. See [Storage and backups](/guide/storage-backups) for details.
