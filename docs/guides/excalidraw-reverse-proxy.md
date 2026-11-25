---
title: "Excalidraw Reverse Proxy, HTTPS & WebSockets: Caddy, Nginx, Traefik & Cloudflare"
description: Configure HTTPS and WebSocket upgrades on /socket.io/ for self-hosted Excalidraw behind Caddy, Nginx, Nginx Proxy Manager, Traefik v3, or Cloudflare Tunnel.
---

# Excalidraw reverse proxy, HTTPS, and WebSockets

Point your reverse proxy at one target: the ExcaliDash `frontend` container (host port `6767`, or container port `8080` on a shared Docker network). Forward WebSocket upgrades on `/socket.io/`, allow at least `50M` request bodies, and set `FRONTEND_URL=https://<your-host>` and `TRUST_PROXY` to your proxy hop count on the `backend` service. Caddy and Traefik handle WebSocket upgrades automatically; Nginx requires explicit `Upgrade` and `Connection` headers.

Inside the Compose stack, `excalidash-frontend` runs nginx on container ports `8080` and `80` and proxies `/api/*` and `/socket.io/*` to `backend:8000`. External proxies never need to route to the backend container directly.

## Required backend environment variables

Set `FRONTEND_URL` and `TRUST_PROXY` on `backend` in `compose.override.yml`:

```yaml
services:
  backend:
    environment:
      FRONTEND_URL: https://draw.example.com
      TRUST_PROXY: "1"
```

| Variable                 | Value                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `FRONTEND_URL`           | Exact browser origin (scheme + hostname + non-default port, no trailing slash). Comma-separate multiple origins if needed.              |
| `TRUST_PROXY`            | Number of trusted proxy hops (`"1"` for Caddy, Nginx, or Traefik; `"2"` for Cloudflare Proxy → Nginx → ExcaliDash).                     |
| `ENFORCE_HTTPS_REDIRECT` | Defaults to `true` when `FRONTEND_URL` uses `https://`. Set to `"false"` only if you need plain HTTP for internal checks or LAN access. |

Apply the override:

```bash
docker compose -f docker-compose.prod.yml -f compose.override.yml up -d
```

## Caddy

Caddy handles TLS certificates and WebSocket upgrades with no extra directives:

```txt
draw.example.com {
    reverse_proxy 127.0.0.1:6767
}
```

If Caddy shares a Docker network with ExcaliDash, proxy directly to `excalidash-frontend:8080`.

## Nginx

Set `Upgrade`, `Connection`, a `client_max_body_size` matching ExcaliDash's `50M` frontend limit (or higher if you raise upload caps), and a long `proxy_read_timeout`:

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

`proxy_read_timeout 3600s` stops nginx from terminating idle Socket.IO connections during long sessions.

## Nginx Proxy Manager (NPM)

1. Open Proxy Hosts → Add Proxy Host.
2. Set Domain Names to `draw.example.com`, Scheme to `http`, Forward Hostname / IP to your Docker host (or `excalidash-frontend` on a shared network), and Forward Port to `6767` (or `8080` on a shared network).
3. Turn WebSockets Support ON.
4. Under SSL, select your Let's Encrypt certificate and enable Force SSL and HTTP/2 Support.
5. Under Advanced, add:

```nginx
client_max_body_size 50M;
proxy_read_timeout 3600s;
```

## Traefik v3 (Docker labels)

Attach `frontend` to your Traefik network in `compose.override.yml`:

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

Traefik passes WebSocket upgrades through automatically on HTTP routers.

## Cloudflare Tunnel (`cloudflared`)

1. Add a Public Hostname (`draw.example.com`) pointing to `http://127.0.0.1:6767` (or `http://excalidash-frontend:8080` on a shared Docker network).
2. Confirm WebSockets is enabled under Network in Cloudflare (enabled by default).
3. Set `FRONTEND_URL: https://draw.example.com` and `TRUST_PROXY: "1"` on `backend` (use `"2"` if `cloudflared` forwards to another reverse proxy before ExcaliDash).

## Verify your reverse proxy

1. Open `https://draw.example.com` and sign in. If you bounce back to `/login`, verify `TRUST_PROXY` and `FRONTEND_URL`.
2. Open a drawing and inspect DevTools → Network → WS. `/socket.io/?EIO=4&transport=websocket` should return `101 Switching Protocols`.
3. Paste a large screenshot into a canvas to confirm the proxy does not return `413 Request Entity Too Large`.

Next steps: [Excalidraw OIDC & SSO setup](/guides/excalidraw-oidc-sso) or [Collaboration and sharing](/guide/collaboration).
