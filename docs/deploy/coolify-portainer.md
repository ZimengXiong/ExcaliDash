---
title: Deploy on Coolify, Portainer & Dokploy
description: Deploy self-hosted Excalidraw with ExcaliDash on Coolify, Portainer Stacks, or Dokploy using standalone Docker Compose templates.
---

# Deploy ExcaliDash on Coolify, Portainer, and Dokploy

If you manage self-hosted apps through a web panel instead of SSH and `git clone`, deploy ExcaliDash using a standalone Compose stack with pre-built Docker Hub images (`zimengxiong/excalidash-backend` and `zimengxiong/excalidash-frontend`).

## Key rules for panel deployments

Keep three details right regardless of which panel you use:

1. **Route your public domain to `frontend` on port `8080`** (not `backend`). The `frontend` nginx container proxies `/api/*` and `/socket.io/*` to `backend:8000` internally.
2. **Set `FRONTEND_URL` and `TRUST_PROXY`** on `backend` so HTTPS sessions and live collaboration WebSockets work through your panel's reverse proxy.
3. **Keep `backend-data` as a named volume** so SQLite drawings, local uploads, and secrets persist across redeployments.

## Coolify

1. In Coolify, select **+ New Resource → Docker Compose Empty**.
2. Paste this Compose file:

```yaml
services:
  backend:
    image: zimengxiong/excalidash-backend:0.7.0
    init: true
    environment:
      DATABASE_PROVIDER: sqlite
      DATABASE_URL: file:/app/prisma/dev.db
      PORT: 8000
      NODE_ENV: production
      AUTH_MODE: local
      FRONTEND_URL: ${SERVICE_URL_FRONTEND}
      TRUST_PROXY: "1"
      JWT_SECRET: ${SERVICE_PASSWORD_64_JWT}
      CSRF_SECRET: ${SERVICE_PASSWORD_64_CSRF}
    volumes:
      - backend-data:/app/prisma
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
    environment:
      - SERVICE_FQDN_FRONTEND_8080
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  backend-data:
```

3. On the `frontend` service settings, assign your domain (for example `https://draw.example.com`) targeting port `8080`.
4. Click **Deploy**. Coolify's built-in Traefik proxy forwards WebSocket upgrades automatically.
5. Open your domain and complete [first-run setup](/guide/first-run#create-the-administrator).

## Portainer Stacks

1. Open **Stacks → + Add stack** and name it `excalidash`.
2. Paste this Compose file into the Web editor:

```yaml
services:
  backend:
    image: zimengxiong/excalidash-backend:0.7.0
    init: true
    environment:
      DATABASE_PROVIDER: sqlite
      DATABASE_URL: file:/app/prisma/dev.db
      PORT: 8000
      NODE_ENV: production
      AUTH_MODE: local
      FRONTEND_URL: ${FRONTEND_URL}
      TRUST_PROXY: ${TRUST_PROXY:-false}
      JWT_SECRET: ${JWT_SECRET}
      CSRF_SECRET: ${CSRF_SECRET}
    volumes:
      - backend-data:/app/prisma
    networks:
      - excalidash-network
    restart: unless-stopped

  frontend:
    image: zimengxiong/excalidash-frontend:0.7.0
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

3. Under **Environment variables**, add:
   - `JWT_SECRET` — 64-char random hex string (`openssl rand -hex 32`)
   - `CSRF_SECRET` — second 64-char random hex string
   - `FRONTEND_URL` — your public URL (e.g., `https://draw.example.com`) if behind a reverse proxy, or omit for local HTTP
   - `TRUST_PROXY` — `1` if behind Nginx Proxy Manager / Caddy / Traefik, or `false` for direct LAN access
4. Click **Deploy the stack**. If exposing publicly, point your reverse proxy at port `6767` with WebSocket upgrades enabled (see [Reverse proxy & HTTPS](/guides/excalidraw-reverse-proxy)).

## Dokploy

1. Create a **Compose** service inside your Dokploy project and select **Raw** provider.
2. Paste the Portainer Compose YAML above, replacing the `ports:` mapping on `frontend` with Dokploy's Traefik domain routing (target service `frontend`, container port `8080`).
3. Add `FRONTEND_URL=https://draw.example.com`, `TRUST_PROXY=1`, `JWT_SECRET`, and `CSRF_SECRET` under **Environment**.
4. Deploy and open your configured HTTPS domain.

## Upgrades and backups

- **Upgrades:** Keep `excalidash-backend` and `excalidash-frontend` pinned to the same release tag (for example `0.7.0`), export a `.excalidash` backup first, update both tags together, and redeploy.
- **Database options:** To pair your panel deployment with PostgreSQL or S3/MinIO/R2, see [PostgreSQL & S3 storage](/guides/excalidraw-postgresql-s3).
- **Team SSO:** Add Authentik, Keycloak, Pocket ID, or Authelia via the [OIDC & SSO guide](/guides/excalidraw-oidc-sso).
