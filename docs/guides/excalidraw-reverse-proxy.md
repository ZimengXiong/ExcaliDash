---
title: Excalidraw Reverse Proxy & HTTPS
description: Configure HTTPS and WebSocket upgrades for self-hosted Excalidraw behind Caddy, Nginx, Nginx Proxy Manager, Traefik, or Cloudflare Tunnel.
---

# Reverse proxy, HTTPS, and WebSockets

ExcaliDash's `frontend` container runs nginx on both container ports `8080` and `80` (mapped to host port `6767` in `docker-compose.prod.yml`) and proxies `/api/*` and `/socket.io/*` internally to `backend:8000`.

Your reverse proxy only needs to route traffic to **one target**—the `frontend` container—while forwarding WebSocket upgrades for `/socket.io/` and preserving forwarding headers.

## Required backend environment variables

Before configuring your proxy, set `FRONTEND_URL` and `TRUST_PROXY` on the `backend` container in `compose.override.yml`:

```yaml
services:
  backend:
    environment:
      FRONTEND_URL: https://draw.example.com
      TRUST_PROXY: "1"
```

- **`FRONTEND_URL`** must match the exact origin you open in the browser (scheme + hostname + non-default port, with no trailing slash). You can supply a comma-separated list if serving multiple origins.
- **`TRUST_PROXY`** must equal the number of trusted proxies between the internet and ExcaliDash (for example `"1"` behind Caddy/Nginx/Traefik, or `"2"` behind Cloudflare Proxy → Nginx → ExcaliDash). Ensure your proxy overwrites client-supplied `X-Forwarded-*` headers.
- **`ENFORCE_HTTPS_REDIRECT`** defaults to `true` when `FRONTEND_URL` uses `https://`. Set it to `"false"` only if you terminate TLS externally and need plain HTTP access on an internal health check or LAN host.

Apply changes:

```bash
docker compose -f docker-compose.prod.yml -f compose.override.yml up -d
```

## Caddy

Caddy handles TLS certificates and WebSocket upgrades automatically:

```txt
draw.example.com {
    reverse_proxy 127.0.0.1:6767
}
```

If Caddy shares a Docker network with ExcaliDash, target `excalidash-frontend:8080` directly instead of `127.0.0.1:6767`.

## Nginx

Include `Upgrade`, `Connection`, and a `client_max_body_size` that matches ExcaliDash's `50M` frontend body limit (or higher if you increase upload limits):

```nginx
server {
    listen 443 ssl http2;
    server_name draw.example.com;

    ssl_certificate     /etc/letsencrypt/live/draw.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/draw.example.com/privkey.pem;

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
        proxy_read_timeout 3600s;
    }
}
```

`proxy_read_timeout 3600s` prevents nginx from closing idle Socket.IO connections during long whiteboarding sessions.

## Nginx Proxy Manager (NPM)

1. Open **Proxy Hosts → Add Proxy Host**.
2. Set **Domain Names** to `draw.example.com`, **Scheme** to `http`, **Forward Hostname / IP** to your Docker host (or `excalidash-frontend` on a shared network), and **Forward Port** to `6767` (or `8080` on a shared network).
3. Turn **WebSockets Support** **ON** (required for live collaboration).
4. Under the **SSL** tab, select your Let's Encrypt certificate and enable **Force SSL** and **HTTP/2 Support**.
5. Under the **Advanced** tab, add:

```nginx
client_max_body_size 50M;
proxy_read_timeout 3600s;
```

## Traefik v3 (Docker labels)

Attach the `frontend` service to your Traefik proxy network and add these labels in `compose.override.yml`:

```yaml
services:
  frontend:
    networks:
      - excalidash-network
      - traefik-proxy
    labels:
      - traefik.enable=true
      - traefik.docker.network=traefik-proxy
      - traefik.http.routers.excalidash.rule=Host(`draw.example.com`)
      - traefik.http.routers.excalidash.entrypoints=websecure
      - traefik.http.routers.excalidash.tls.certresolver=letsencrypt
      - traefik.http.services.excalidash.loadbalancer.server.port=8080

networks:
  traefik-proxy:
    external: true
```

Traefik forwards WebSocket upgrades automatically on HTTP routers.

## Cloudflare Tunnel (`cloudflared`)

When exposing ExcaliDash through Cloudflare Zero Trust Tunnels:

1. Add a **Public Hostname** (`draw.example.com`) pointing to `http://127.0.0.1:6767` (or `http://excalidash-frontend:8080` if `cloudflared` runs on the same Docker network).
2. In your Cloudflare dashboard under **Network**, verify **WebSockets** is enabled (on by default).
3. Set `FRONTEND_URL: https://draw.example.com` and `TRUST_PROXY: "1"` on `backend` (use `"2"` if `cloudflared` forwards to another local reverse proxy before ExcaliDash).

## Verify your proxy setup

1. **API & TLS check:** Open `https://draw.example.com` and sign in. If you immediately bounce back to the login page, check `TRUST_PROXY` and `FRONTEND_URL`.
2. **WebSocket check:** Open a drawing, open browser DevTools → **Network → WS**, and confirm the `/socket.io/?EIO=4&transport=websocket` request returns **`101 Switching Protocols`**.
3. **Upload limit check:** Paste a large image into a drawing to confirm your proxy does not return `413 Request Entity Too Large`.

Continue with [OIDC & SSO setup](/guides/excalidraw-oidc-sso) or [Real-time collaboration & sharing](/guide/collaboration).
