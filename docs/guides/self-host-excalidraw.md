---
title: How to Self-Host Excalidraw with Collaboration & Saved Drawings
description: Complete guide to self-hosting Excalidraw with Docker Compose. Compare the official excalidraw/excalidraw image, excalidraw-room, and ExcaliDash with persistent storage, live collaboration, and HTTPS reverse proxy configs.
---

# How to self-host Excalidraw with collaboration and saved drawings

If you deploy the official `excalidraw/excalidraw` Docker image, you quickly hit two surprises: drawings are only saved in your browser's `localStorage`, and live collaboration points at Excalidraw's public servers (`oss-collab.excalidraw.com`) rather than your own machine.

This guide compares the three ways to self-host Excalidraw and shows how to deploy a complete self-hosted Excalidraw workspace with Docker Compose, real-time collaboration, and HTTPS.

## The 3 ways to self-host Excalidraw

| Approach                               | Server-side saved drawings                   | Self-hosted collaboration                          | Accounts & collections     | Setup effort |
| -------------------------------------- | -------------------------------------------- | -------------------------------------------------- | -------------------------- | ------------ |
| Official `excalidraw/excalidraw` image | No (browser `localStorage` only)             | No (uses public collab server)                     | No                         | Low          |
| `excalidraw` + `excalidraw-room`       | No (manual `.excalidraw` files)              | Yes (requires custom frontend build or URL patch)  | No                         | Medium–High  |
| **ExcaliDash** (Docker Compose)        | **Yes** (SQLite or PostgreSQL + optional S3) | **Yes** (built-in Socket.IO backend + follow mode) | **Yes** (local + OIDC SSO) | **Low**      |

- **Choose the official image** if you only want a private, ephemeral scratchpad and are happy manually saving `.excalidraw` files to disk.
- **Choose `excalidraw-room`** if you only want anonymous ephemeral rooms with no dashboard, accounts, or database.
- **Choose ExcaliDash** if you want to save drawings on your server, organize them into collections, collaborate live on your own backend, and access your workspace from any device.

## Self-host Excalidraw with Docker Compose (ExcaliDash)

Create a `docker-compose.yml` file on your server, VPS, or homelab:

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
      TRUST_PROXY: "1"
      FRONTEND_URL: https://draw.example.com
    volumes:
      - backend-data:/app/prisma
    networks:
      - excalidash-network
    restart: unless-stopped

  frontend:
    image: zimengxiong/excalidash-frontend:latest
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

For local testing without HTTPS, omit `FRONTEND_URL` and set `TRUST_PROXY: "false"`.

Start the stack:

```bash
docker compose up -d
```

Open `http://localhost:6767` (or your domain) and complete [first-run setup](/guide/first-run#create-the-administrator) to create your administrator account.

## Configure HTTPS and WebSockets for real-time collaboration

ExcaliDash runs its own Socket.IO collaboration server inside the `backend` container, proxied through `frontend` on `/socket.io/`. You do **not** need a separate `excalidraw-room` container or custom frontend build.

Put an HTTPS reverse proxy in front of port `6767` and forward WebSocket upgrades:

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

Make sure `FRONTEND_URL` matches the exact `https://` origin you open in the browser, and `TRUST_PROXY` matches the number of reverse proxies in front of ExcaliDash.

## Use PostgreSQL or S3 storage (optional)

SQLite works out of the box for individuals and small teams. For larger deployments, switch `DATABASE_PROVIDER` to `postgresql` and point `DATABASE_URL` at your Postgres instance, or configure `S3_BUCKET` for MinIO, Cloudflare R2, or AWS S3 image storage. See the [environment variables reference](/reference/environment).

## Next steps

- [Self-hosted Excalidraw collaboration and sharing](/guide/collaboration)
- [Set up OIDC / SSO with Authentik, Keycloak, or Pocket ID](/guides/excalidraw-oidc-sso)
- [Automated backups, version history, and `.excalidraw` import/export](/guide/storage-backups)
- [Full production Docker Compose guide](/deploy/docker)
