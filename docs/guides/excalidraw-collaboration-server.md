---
title: "Excalidraw Collaboration Server: excalidraw-room Docker, VITE_APP_WS_SERVER_URL & No-Rebuild Setup"
description: Self-host an Excalidraw collaboration server with excalidraw-room in Docker, why VITE_APP_WS_SERVER_URL needs a rebuild, HTTPS/crypto.subtle, and ExcaliDash.
---

# Self-host an Excalidraw collaboration server: `excalidraw-room`, `VITE_APP_WS_SERVER_URL`, and a no-rebuild option

The official `excalidraw/excalidraw` Docker image sends live collaboration sessions to Excalidraw's public server because `VITE_APP_WS_SERVER_URL` is compiled into the JavaScript bundle at build time, so passing it as a container environment variable has no effect. Keeping collaboration on your own infrastructure requires running `excalidraw-room`, rebuilding or patching the frontend, serving everything over HTTPS, and accepting ephemeral rooms. ExcaliDash skips the rebuild by bundling a same-origin Socket.IO server at `/socket.io/` alongside database persistence.

## How official Excalidraw collaboration works

| Component                    | Role                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `excalidraw/excalidraw`      | Static web app. Encrypts scene updates in the browser before sending them.              |
| `excalidraw/excalidraw-room` | Socket.IO relay. Forwards encrypted messages between clients in a room; stores nothing. |
| Firebase (upstream)          | Used by `excalidraw.com` to persist room scenes and images for late joiners.            |

The room ID and encryption key live in the URL fragment (`#room=<id>,<key>`), so the relay never sees drawing contents. Once every participant closes the tab, the scene survives only in each user's local browser storage.

## Why is `VITE_APP_WS_SERVER_URL` ignored in Docker?

Excalidraw uses Vite, which replaces every `VITE_*` environment variable with a literal string during the frontend build. Upstream's production build compiles `https://oss-collab.excalidraw.com` directly into the JavaScript bundle and serves the static output from nginx.

Because nginx only serves precompiled static files, passing `-e VITE_APP_WS_SERVER_URL=https://collab.example.com` to `docker run` changes nothing. The same applies to `VITE_APP_BACKEND_V2_GET_URL`, `VITE_APP_BACKEND_V2_POST_URL` (shareable links), and `VITE_APP_FIREBASE_CONFIG`.

Upstream tracks this in the self-hosting umbrella issue [#1772](https://github.com/excalidraw/excalidraw/issues/1772), the collaboration-server docs issue [#3660](https://github.com/excalidraw/excalidraw/issues/3660), and the runtime environment injection pull request [#10843](https://github.com/excalidraw/excalidraw/pull/10843).

## Running `excalidraw-room` in Docker: four approaches

| Approach          | How it works                                                                                            | Tradeoff                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Rebuild the image | Clone `excalidraw/excalidraw`, update `VITE_APP_WS_SERVER_URL` in `.env.production`, run `docker build` | You maintain a custom image and rebuild on every upstream update     |
| Patch the bundle  | Container entrypoint runs `sed` over compiled JS to replace the upstream collab hostname                | Breaks silently when upstream renames or restructures built assets   |
| Runtime-env fork  | Community images such as `alswl/excalidraw` inject `VITE_APP_*` values at container startup             | Depends on a third-party fork tracking upstream releases             |
| Built-in backend  | Deploy a stack that pairs the editor with its own backend on `/socket.io/`, such as ExcaliDash          | Workspace app around the editor; import existing `.excalidraw` files |

A minimal rebuild of the official frontend looks like this:

```bash
git clone https://github.com/excalidraw/excalidraw.git
cd excalidraw
sed -i 's|^VITE_APP_WS_SERVER_URL=.*|VITE_APP_WS_SERVER_URL=https://collab.example.com|' .env.production
docker build -t excalidraw-selfhosted .
```

You need to repeat this whenever you upgrade Excalidraw. Run `excalidraw-room` alongside it:

```yaml
services:
  excalidraw:
    image: excalidraw-selfhosted
    ports:
      - "5000:80"
  excalidraw-room:
    image: excalidraw/excalidraw-room
    ports:
      - "5001:80"
```

Put both services behind an HTTPS reverse proxy that forwards WebSocket upgrades. Note that `excalidraw-room` relays traffic only, stores no drawings, and had its last upstream commit in December 2023. If you want a maintained Go relay and storage backend with a runtime-configurable frontend, look at [alswl/excalidraw-collaboration](https://github.com/alswl/excalidraw-collaboration).

## Why HTTPS and `crypto.subtle` are required

Official Excalidraw collaboration encrypts every room payload with AES-GCM via the browser Web Crypto API (`window.crypto.subtle`). Browsers restrict `crypto.subtle` to secure contexts (`https://` origins and `http://localhost`). Over plain `http://` on a LAN IP or internal hostname, `window.crypto.subtle` is undefined and starting a session fails, typically with `generateKey` errors (tracked in [excalidraw#9497](https://github.com/excalidraw/excalidraw/issues/9497)).

Terminate TLS at Caddy, Nginx, Traefik, Cloudflare Tunnel, or an internal CA. The WebSocket URL must also use `wss://` when the app loads over `https://`, or browsers block it as mixed content.

## Avoiding the rebuild with ExcaliDash

ExcaliDash bundles the Excalidraw editor with a Node.js backend that serves Socket.IO collaboration on the same origin. Its frontend nginx container proxies `/socket.io/` to the backend, so no WebSocket hostname is baked into the frontend bundle.

| Requirement             | Official image + `excalidraw-room`               | ExcaliDash                                                                     |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Frontend rebuild        | Yes, to set `VITE_APP_WS_SERVER_URL`             | No                                                                             |
| Extra services          | `excalidraw-room`, optional Firebase replacement | None beyond `frontend` and `backend`                                           |
| Collaboration endpoint  | Separate hostname or path for the relay          | Same origin, `/socket.io/`                                                     |
| Saved drawings          | No (browser `localStorage`, ephemeral rooms)     | Yes (SQLite or PostgreSQL)                                                     |
| Who can join            | Anyone with the room link                        | Accounts with view/edit access, or "Anyone with the link" with optional expiry |
| End-to-end encryption   | Yes (key in URL fragment)                        | No; TLS in transit, data stored on your server                                 |
| Secure context required | Yes (`crypto.subtle`)                            | HTTPS recommended for `Secure` cookies; `localhost` works for testing          |

Start ExcaliDash with:

```bash
git clone https://github.com/ZimengXiong/ExcaliDash.git
cd ExcaliDash
docker compose -f docker-compose.prod.yml up -d
```

Behind a reverse proxy, forward WebSocket upgrades on `/socket.io/`, set `FRONTEND_URL` to your public `https://` origin, and set `TRUST_PROXY` to your proxy hop count. See [Reverse proxy, HTTPS & WebSockets](/guides/excalidraw-reverse-proxy) and [Collaboration and sharing](/guide/collaboration).

Tradeoffs to keep in mind: ExcaliDash does not end-to-end encrypt scenes (the server reads them to generate previews, search, and version history), and the backend runs as a single process (`replicas: 1`). See [how ExcaliDash works](/guides/how-excalidash-works) for details on the Socket.IO sync protocol.

## Verify WebSocket upgrades

Open a drawing, then check browser DevTools → Network → WS. The `/socket.io/?EIO=4&transport=websocket` request should return `101 Switching Protocols`. A `400` status or repeated HTTP polling requests means your reverse proxy is stripping `Upgrade` or `Connection` headers.

## Related guides

- [How to self-host Excalidraw](/guides/self-host-excalidraw)
- [How ExcaliDash works](/guides/how-excalidash-works)
- [Self-hosted Excalidraw projects compared](/guides/self-hosted-excalidraw-projects)
- [Excalidraw Docker not saving drawings](/guides/excalidraw-docker-not-saving)
