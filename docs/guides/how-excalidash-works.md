---
title: "How ExcaliDash Works: Persistence, Real-Time Sync & Auth for Excalidraw"
description: "Architecture of ExcaliDash, a self-hosted Excalidraw backend: SQLite and PostgreSQL storage, image storage, Socket.IO sync, OIDC auth, and single-node limits."
---

# How ExcaliDash works: adding persistence, real-time sync, and auth to Excalidraw

ExcaliDash embeds the open-source `@excalidraw/excalidraw` editor inside a two-container stack: an unprivileged nginx frontend serving the React workspace and proxying `/api/` and `/socket.io/` to a Node.js backend running Express, Prisma (SQLite or PostgreSQL), Socket.IO, and OpenID Connect. Because API and WebSocket traffic share the browser's origin, there is no `VITE_APP_WS_SERVER_URL` rebuild and no separate `excalidraw-room` service to operate.

This guide covers how ExcaliDash handles server-side persistence, image uploads, live collaboration, authentication, and the single-node tradeoffs to keep in mind.

## What upstream Excalidraw ships vs what a self-hosted team needs

Upstream Excalidraw publishes two distinct pieces: the `@excalidraw/excalidraw` React editor package (canvas, tools, rendering, `.excalidraw` format) and the static `excalidraw/excalidraw` web app container.

| Layer              | Official `excalidraw/excalidraw` + `excalidraw-room` | ExcaliDash                                                          |
| ------------------ | ---------------------------------------------------- | ------------------------------------------------------------------- |
| Editor canvas      | `@excalidraw/excalidraw`                             | `@excalidraw/excalidraw`                                            |
| Scene storage      | Browser `localStorage` + IndexedDB                   | SQLite or PostgreSQL database                                       |
| Image assets       | Inline base64 in IndexedDB                           | Content-addressed binary blobs in the database or S3                |
| Live collaboration | Separate `excalidraw-room` relay + build-time WS URL | Built-in Socket.IO server on `/socket.io/`                          |
| History            | Manual `.excalidraw` exports                         | Automatic Brotli-compressed snapshots                               |
| Access control     | None (anyone with `#room=` link)                     | Local and OIDC users, collections, view/edit grants, expiring links |

ExcaliDash embeds `@excalidraw/excalidraw` directly as its editor component and builds the backend and workspace around it.

## Same-origin routing without rebuilding the frontend

In upstream `excalidraw/excalidraw`, Vite compiles `VITE_APP_WS_SERVER_URL` into minified static JavaScript at build time, forcing self-hosters to rebuild or patch the frontend image to point at their own `excalidraw-room` host.

ExcaliDash never bakes a backend hostname into the frontend bundle. On container start, the frontend nginx process templates `BACKEND_URL` (default `backend:8000`) and uses Docker's embedded DNS resolver with a 5-second TTL so restarting the backend container never leaves nginx holding a stale IP. Nginx listens on ports `80` and `8080`, proxies `/api/` to the backend, and proxies `/socket.io/` with WebSocket upgrade headers and a 1-hour read/send timeout.

In the browser, Socket.IO connects straight back to `window.location.origin` on `/socket.io`. Wherever you host ExcaliDash (`localhost:6767`, a LAN hostname, or `https://draw.example.com`), live collaboration works out of the box with no rebuild. Nginx also serves `/index.html` with `no-store` while caching hashed static bundles for a year so browsers never get stuck on an old HTML shell after an upgrade.

## SQLite and PostgreSQL from one backend image

Supporting both zero-config SQLite and PostgreSQL in a single Docker image normally breaks air-gapped startups if database clients have to be downloaded at boot.

ExcaliDash prebuilds both the SQLite and PostgreSQL Prisma clients during the image build. At container startup, the backend reads `DATABASE_PROVIDER` (`sqlite` or `postgresql`), activates the matching client, acquires a migration lock, and runs schema migrations automatically with no internet access required.

For SQLite, ExcaliDash serializes writes through a single connection with a 10-second busy timeout, Write-Ahead Logging (`WAL`), and incremental auto-vacuum so concurrent team autosaves queue cleanly instead of hitting database lock errors. Scheduled SQLite backups (`BACKUP_SCHEDULE`) run `VACUUM INTO` over that same connection and atomically rename the finished file, producing consistent backups without pausing writes.

## Scene saves, conflict merges, and version history

### Optimistic concurrency and deterministic merges

When the editor autosaves, it sends the scene alongside its last known version number. The backend validates and sanitizes the payload, checks the version inside a database transaction, merges incoming image references as a union so one client never wipes another collaborator's pasted images, and increments the version atomically.

If another collaborator saved first, the backend returns HTTP `409` with the latest version. The editor backs off briefly, pulls the server scene, reconciles elements deterministically (higher element version wins, with nonce and timestamp tie-breakers matching Excalidraw's own rules while protecting elements you are actively typing or dragging), and retries the save.

### Automatic Brotli snapshots

Before writing a scene update, the backend compresses the previous state asynchronously with Brotli so large canvases do not stall request handling. Rapid autosaves skip duplicate snapshots within `SNAPSHOT_MIN_INTERVAL_SECONDS`, except when a save removes more than 10% of live elements on the canvas, which always forces a snapshot to guard against accidental wipes.

An hourly cleanup task prunes snapshots older than `SNAPSHOT_RETENTION_DAYS` (default 2 days). Restoring any snapshot first saves the current state as a new snapshot, making every restore reversible.

## Out-of-band image uploads and S3 storage

Excalidraw stores pasted images as inline base64 data URLs inside the scene JSON. Uploading multi-megabyte base64 strings on every autosave slows down saves and bloats scene rows.

ExcaliDash moves images out of the scene JSON automatically. As soon as you paste an image, the editor compresses it and uploads the raw bytes in the background (up to 3 concurrent uploads) and swaps the inline data URL for `/api/files/<drawingId>/<fileId>`, shrinking subsequent scene saves from megabytes to kilobytes. If an autosave runs before a background upload finishes (or comes from an unauthenticated link-share editor), the backend decodes any remaining inline images and stores them idempotently on save.

By default, image bytes live in the database and stream back with permission checks and `ETag` caching (`304 Not Modified`). When `S3_BUCKET` is configured (AWS S3, Cloudflare R2, MinIO, Backblaze B2, or Wasabi), images go straight to object storage under unique per-upload keys. With `S3_PUBLIC_URL` set, scenes link directly to your CDN or public bucket URL; otherwise the backend checks drawing permissions and returns a 1-hour presigned redirect, forcing download headers on SVG files.

## Built-in real-time collaboration on `/socket.io/`

Socket.IO runs on the same HTTP server as the REST API. Connections authenticate using the browser's `HttpOnly` session cookie or an explicit `exd_...` API key, while anonymous sockets are allowed to connect for "anyone with the link" shares and checked when joining a room.

Room presence is tracked per socket on the server using canonical user records so two tabs from the same person stay separate and clients cannot spoof collaborator names. Cursor movements and viewport bounds travel over volatile messages so stale frames drop under congestion instead of piling up. Follow mode keeps no server-side follower list: clients broadcast their viewport bounds and target collaborator, and each peer resolves follow chains locally with cycle detection.

Editors broadcast live element deltas immediately for low latency, and every committed scene save also emits the persisted version to the rest of the room so late joiners stay in sync. Whenever a drawing share, collection share, link expiry, or API key is revoked, active room sockets are rechecked immediately and evicted if they lost access.

## Authentication, OIDC SSO, and permissions

`AUTH_MODE` controls sign-in behavior: `local` (default), `hybrid` (local plus OIDC), `oidc_enforced` (OIDC only), or `disabled` (single-user isolated networks). Local and OIDC logins issue short-lived JWT access and refresh tokens in `HttpOnly`, `SameSite=Lax` cookies, marked `Secure` whenever the request arrives over HTTPS or a trusted reverse proxy (`TRUST_PROXY`).

OpenID Connect runs Authorization Code + PKCE (`S256`) with `state` and `nonce` stored in a signed short-lived cookie. If your identity provider lives on the same Docker host behind hairpin NAT, `OIDC_DISCOVERY_URL` lets the backend fetch discovery metadata internally while keeping the public `OIDC_ISSUER_URL`. Configuring `OIDC_ADMIN_GROUPS` syncs admin roles from your identity provider's group claims.

Browser mutations check `Origin`/`Referer` against `FRONTEND_URL` plus an `x-csrf-token` header. Personal API keys (`Authorization: Bearer exd_...`) bypass CSRF and are restricted to `drawings` and `collections` routes matching their granted scopes (`drawings:read`, `drawings:write`, `collections:read`, `collections:write`). Effective drawing access evaluates the highest privilege across drawing ownership, direct drawing shares, collection shares, and unexpired link shares; trashed drawings are invisible to non-owners even with an active share link.

## Architectural tradeoffs

ExcaliDash makes a few deliberate tradeoffs to keep self-hosting simple.

### Single backend replica (`replicas: 1`)

Socket.IO room membership, presence state, login rate limiting, and short-lived list caches live in one Node.js process, and SQLite only allows one writer host. Running multiple backend replicas behind a load balancer splits collaborators across processes so live edits stop syncing between them. Keep the backend at one replica; the nginx frontend can scale independently if needed.

### Server-readable storage instead of E2E encryption

Unlike `excalidraw.com` + `excalidraw-room` (where decryption keys live only in the URL fragment), ExcaliDash stores drawings readable by your backend so it can render dashboard previews, search by title, enforce per-user permissions, and keep version history. Serve traffic over HTTPS and protect access to your database volume and backups.

### SQLite-only built-in backup scheduler

`BACKUP_SCHEDULE` uses SQLite's `VACUUM INTO` command. PostgreSQL deployments should use `pg_dump` or managed database snapshots.

## Next steps

- [How to self-host Excalidraw with Docker Compose](/guides/self-host-excalidraw)
- [Self-host Excalidraw collaboration (`excalidraw-room` vs ExcaliDash)](/guides/excalidraw-collaboration-server)
- [Reverse proxy, HTTPS & WebSockets](/guides/excalidraw-reverse-proxy)
- [PostgreSQL & S3 storage](/guides/excalidraw-postgresql-s3)
- [Kubernetes, Proxmox & Unraid deployment](/deploy/kubernetes-proxmox-unraid)
