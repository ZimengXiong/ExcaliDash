---
title: "How ExcaliDash Works: Persistence, Real-Time Sync & Auth for Excalidraw"
description: "Architecture of ExcaliDash, a self-hosted Excalidraw backend: SQLite and PostgreSQL storage, image interning, Socket.IO sync, OIDC auth, and single-node limits."
---

# How ExcaliDash works: adding persistence, real-time sync, and auth to Excalidraw

ExcaliDash embeds the open-source `@excalidraw/excalidraw` editor inside a two-container stack: an unprivileged nginx `frontend` serving the React workspace and proxying `/api/` and `/socket.io/` to a Node.js `backend` running Express, Prisma (SQLite or PostgreSQL), Socket.IO, and OpenID Connect. Because API and WebSocket traffic share the browser's origin, there is no `VITE_APP_WS_SERVER_URL` rebuild and no separate `excalidraw-room` service to operate.

This guide walks through how the codebase actually implements server-side persistence, image storage, live collaboration, authentication, and the single-process limits you should plan around.

## What upstream Excalidraw ships vs what a self-hosted team needs

Upstream Excalidraw publishes two distinct pieces: the `@excalidraw/excalidraw` React editor package (canvas, tools, rendering, `.excalidraw` format) and the static `excalidraw/excalidraw` web app container.

| Layer              | Official `excalidraw/excalidraw` + `excalidraw-room` | ExcaliDash                                                      |
| ------------------ | ---------------------------------------------------- | --------------------------------------------------------------- |
| Editor canvas      | `@excalidraw/excalidraw`                             | `@excalidraw/excalidraw`                                        |
| Scene storage      | Browser `localStorage` + IndexedDB                   | `Drawing` rows in SQLite or PostgreSQL via Prisma               |
| Image assets       | Inline base64 in IndexedDB                           | Content-addressed `DrawingFile` blobs in DB or S3               |
| Live collaboration | Separate `excalidraw-room` relay + build-time WS URL | Built-in Socket.IO server on `/socket.io/`                      |
| History            | Manual `.excalidraw` exports                         | Brotli-compressed `DrawingSnapshot` rows                        |
| Access control     | None (anyone with `#room=` link)                     | Local/OIDC users, collections, view/edit grants, expiring links |

ExcaliDash uses `@excalidraw/excalidraw` directly as its editor component and builds the entire backend and workspace around it.

## Same-origin routing: eliminating the `VITE_APP_WS_SERVER_URL` rebuild

In upstream `excalidraw/excalidraw`, Vite compiles `VITE_APP_WS_SERVER_URL` into minified static JavaScript at build time, which forces self-hosters to rebuild or patch the frontend image to point at their own `excalidraw-room` host.

ExcaliDash avoids baking any backend hostname into the frontend bundle:

1. **Runtime nginx templating (`frontend/docker-entrypoint.sh` + `frontend/nginx.conf.template`):** on container start, the frontend substitutes `BACKEND_URL` (default `backend:8000`) into `/tmp/nginx.conf` and validates it with `nginx -t`. When Docker's embedded DNS (`127.0.0.11`) is present in `/etc/resolv.conf`, it enables `resolver 127.0.0.11 valid=5s ipv6=off` so container restarts do not leave nginx holding a stale backend IP.
2. **Single-origin proxying:** nginx listens on ports `80` and `8080`, proxies `/api/` to `excalidash_backend` (stripping the `/api` prefix, while Express also strips `/api` defensively if another proxy forwards it verbatim), and proxies `/socket.io/` with `Upgrade`, `Connection: upgrade`, and a `3600s` read/send timeout.
3. **Browser-origin Socket.IO (`frontend/src/pages/editor/useEditorCollaboration.ts`):** when built with `VITE_API_URL="/api"`, `getSocketUrl()` resolves to `window.location.origin` with `path: "/socket.io"`. Wherever you host ExcaliDash—`localhost:6767`, a LAN hostname, or `https://draw.example.com`—the browser connects back to that same origin without rebuilding anything.
4. **Upgrade-safe caching:** nginx serves `/index.html` with `Cache-Control: no-store, no-cache, must-revalidate` while hashed JS/CSS/font bundles get `public, immutable` 1-year caching, preventing clients from getting pinned to an old HTML shell after an image upgrade.

## Persistence: SQLite and PostgreSQL from one backend image

Supporting both zero-config SQLite and PostgreSQL in a single Docker image normally breaks air-gapped startups if `prisma generate` tries to download engine binaries at boot.

ExcaliDash solves this in `backend/Dockerfile` and `backend/docker-entrypoint.sh`:

- **Build-time dual generation:** during `docker build`, Prisma generates both the SQLite and PostgreSQL clients and stores them under `/app/prisma_clients/sqlite` and `/app/prisma_clients/postgresql`.
- **Startup selection and migration lock:** at container start, `docker-entrypoint.sh` reads `DATABASE_PROVIDER` (`sqlite` or `postgresql`), copies the matching prebuilt client into `/app/dist/generated` and the matching migrations into `/app/prisma/migrations`, acquires an atomic directory lock (`/app/prisma/.migration-lock`), and runs `prisma migrate deploy`. No network access is needed at startup.
- **SQLite concurrency tuning (`backend/src/db/prisma.ts`):** for `file:` URLs, ExcaliDash appends `connection_limit=1`, `socket_timeout=10`, and `pool_timeout=30` to the Prisma datasource URL so concurrent saves queue cleanly inside Prisma instead of colliding across separate SQLite connections. On startup it applies `PRAGMA busy_timeout = 10000`, `PRAGMA journal_mode = WAL`, `PRAGMA synchronous = NORMAL`, and incremental auto-vacuum.
- **Safe online SQLite backups (`backend/src/backups/scheduler.ts`):** scheduled backups execute `VACUUM INTO '<target>.partial'` directly over Prisma's existing connection, `chmod 600` the file, and atomically rename it to `.db`. Opening a second SQLite library handle in the same process is avoided intentionally because POSIX file locks drop across the process when any file descriptor closes.

## Scene saves, conflict reconciliation, and version history

Every drawing lives in the `Drawing` table (`elements`, `appState`, and `files` stored as JSON text, an integer `version`, and an SVG `preview` for dashboard cards).

### Optimistic concurrency and deterministic merges

When the editor autosaves (`PUT /drawings/:id`), `useEditorPersistence.ts` sends the scene along with its last known `version`. On the backend:

1. Request payloads pass Zod schema validation and DOMPurify sanitization (`sanitizeDrawingData` and `sanitizeSvg`).
2. `applySceneUpdateTx` (`backend/src/routes/dashboard/sceneUpdate.ts`) runs inside a Prisma transaction: it checks `where: { id, version }`, merges incoming `files` as a union against stored `files` (`mergeFilesUnion`) so a client with a partial view never wipes another collaborator's images, and increments `version` atomically.
3. If another client committed first, the backend returns HTTP `409 VERSION_CONFLICT` with `currentVersion`. The editor catches `409`, waits with exponential backoff (up to 4 retries), reloads the server scene, reconciles elements locally via `reconcileElements` (`frontend/src/utils/sync.ts`), and retries the save.

`reconcileElements` follows Excalidraw's deterministic ordering so concurrent edits converge identically on every client: higher element `version` wins; on equal `version`, lower `versionNonce` wins; on equal nonce, newer `updated` timestamp wins. Elements currently being typed, resized, or drawn locally are protected until the interaction finishes.

### Brotli snapshots and coalescing

Before writing an updated scene, `applySceneUpdateTx` captures the previous state in `DrawingSnapshot`:

- Fields are compressed asynchronously with Brotli (quality 5, prefixed `br1:`) on Node's libuv thread pool (`encodeSnapshotFieldAsync` in `backend/src/snapshots/snapshotCodec.ts`) so compressing large scenes does not block the event loop.
- Because autosave runs roughly every second during active editing, ordinary saves skip creating a new snapshot if one was taken within `SNAPSHOT_MIN_INTERVAL_SECONDS`. To protect against accidental canvas wipes, any save that drops more than 10% of live elements (`MIN_LIVE_ELEMENT_RATIO = 0.9`) always forces a snapshot.
- An hourly cleanup timer deletes snapshots older than `SNAPSHOT_RETENTION_DAYS` (default 2 days) and reclaims SQLite free pages.
- Restoring a snapshot (`POST /drawings/:id/history/:snapshotId/restore`) validates and decodes the snapshot first, then runs through `applySceneUpdateTx`, which snapshots the current state before applying the old revision—making every restore reversible.

## Image and file storage: out-of-band uploads, interning, and S3

Excalidraw represents pasted images as inline base64 `data:` URLs inside `files`. Sending multi-megabyte base64 strings on every autosave slows down saves and bloats scene rows.

ExcaliDash splits image persistence into two cooperating paths backed by a single `DrawingFile` table keyed on `(drawingId, fileId)`:

1. **Background per-file uploads (`frontend/src/pages/editor/useEditorFileUploads.ts`):** every 800ms (and immediately on `addFiles`), the editor compresses newly inserted images and uploads up to 3 concurrently as raw bytes to `PUT /api/drawings/:drawingId/files/:fileId`. Once uploaded, the persistence and broadcast paths swap the inline `data:` URL for `/api/files/<drawingId>/<fileId>`, shrinking subsequent scene `PUT` requests from megabytes to kilobytes.
2. **Server-side interning fallback (`backend/src/fileProcessing.ts`):** if an autosave runs before a background upload finishes—or comes from an unauthenticated link-share editor that cannot call the authenticated upload route—`internDrawingFiles` decodes any remaining inline `data:` URLs, persists them idempotently (up to 8 concurrent writes), and rewrites both `Drawing.files` and the preview SVG's `<image href="...">` references.
3. **Database blobs vs S3 (`backend/src/routes/files.ts`, `backend/src/s3.ts`):**
   - **Default (`storage = "db"`):** raw bytes live in `DrawingFile.data` (SQLite `BLOB` / PostgreSQL `BYTEA`). `GET /api/files/:drawingId/:fileId` checks drawing view access and streams bytes with `ETag` (`304 Not Modified` support) and `Cache-Control: private, no-cache`.
   - **S3 enabled (`storage = "s3"`):** objects are uploaded under `{S3_KEY_PREFIX}/{userId}/{drawingId}/{generation}/{fileId}.{ext}` (using a per-upload generation UUID so delayed cleanup never deletes a concurrent re-upload). When `S3_PUBLIC_URL` is configured, scene refs point directly to the CDN/public URL; otherwise `GET /api/files/:drawingId/:fileId` checks permissions and issues a 1-hour presigned `302` redirect, forcing `Content-Disposition: attachment` for scriptable types such as `image/svg+xml`.

## Real-time collaboration on `/socket.io/`

Socket.IO attaches to the same HTTP server as Express (`backend/src/index.ts` and `backend/src/server/socket.ts`).

- **Handshake authentication (`socketAuth.ts`):** connections authenticate via an explicit `auth.token` (JWT or `exd_...` API key) or the browser's HttpOnly access-token cookie. API keys are only accepted from `auth.token`, matching REST Bearer rules. Anonymous sockets are allowed to connect when auth is enabled so "anyone with the link" shares work; authorization is enforced on `join-room`.
- **Server-derived presence:** room presence lives in an in-memory `Map<string, PresenceUser[]>` (`roomUsers`), keyed per socket so two tabs from one user stay independent participants. The backend resolves canonical `userId` and display `name` from the `User` row (or `anon:<socket.id>` for guests) rather than trusting client-supplied identity fields.
- **Volatile cursors and stateless follow mode:** `cursor-move` and `visible-bounds` use `socket.volatile.to(roomId)` so stale cursor or viewport frames are dropped under backpressure instead of queuing up. Follow mode keeps zero follower state on the server: every client broadcasts its scene bounds and who it is following (throttled to 50ms), and each peer resolves follow chains locally with cycle detection.
- **Live deltas + persisted catch-up:** editors broadcast `element-update` deltas immediately for low latency. After a scene save commits via `PUT /drawings/:id`, the backend also emits a `persisted: true` `element-update` containing the committed `version` to every other socket in the room (`except(senderSocketId)`), ensuring late joiners who entered between a live delta and the autosave still converge.
- **Live access revocation (`socketAccess.ts`):** hot socket events cache drawing access checks for 2 seconds (`ROOM_ACCESS_TTL_MS`), and any share change, collection move, link expiration, or API key revocation immediately runs `revalidateDrawingAccess`, `revalidateCollectionAccess`, or `disconnectRevokedApiKey`—emitting `access-changed` and evicting revoked sockets from the room.

## Authentication, OIDC, CSRF, and authorization

- **Auth modes (`backend/src/auth/authMode.ts`):** `AUTH_MODE` selects `local`, `hybrid`, `oidc_enforced`, or `disabled` (which maps every request to the `bootstrap-admin` acting user and logs a startup warning). In `local` production mode before any active user exists, an onboarding gate returns `409 AUTH_ONBOARDING_REQUIRED` until first-run admin setup completes.
- **Cookies and `TRUST_PROXY`:** local and OIDC logins issue short-lived JWT access tokens and refresh tokens in HttpOnly `SameSite=Lax` cookies. Both auth and CSRF cookie code mark cookies `Secure` when `req.secure` is true or when `X-Forwarded-Proto: https` arrives under a non-false `TRUST_PROXY`.
- **OIDC flow (`backend/src/auth/oidcRoutes.ts`, `oidcCallbackRoute.ts`):** uses `openid-client` with Authorization Code + PKCE (`S256`), `state`, and `nonce` stored inside a signed short-lived HttpOnly flow cookie. `OIDC_DISCOVERY_URL` lets the backend fetch discovery metadata over an internal Docker/LAN address while keeping the public `OIDC_ISSUER_URL`. When `OIDC_ADMIN_GROUPS` is configured, `middleware/auth.ts` reconciles `ADMIN`/`USER` roles against the token's group claims on active sessions.
- **CSRF and scoped API keys (`backend/src/server/csrf.ts`):** mutating browser requests check `Origin`/`Referer` against `FRONTEND_URL` and validate an `x-csrf-token` header bound to an HttpOnly CSRF client cookie. Non-browser `Authorization: Bearer exd_...` API keys bypass CSRF and are restricted to `drawings` and `collections` endpoints matching their granted scopes (`drawings:read`, `drawings:write`, `collections:read`, `collections:write`).
- **Effective drawing permissions (`backend/src/authz/sharing.ts`):** `getDrawingAccessDetails` evaluates the strongest privilege across four sources: drawing owner, direct `DrawingPermission`, owning or shared parent `Collection`/`CollectionShare`, and active unrevoked/unexpired `DrawingLinkShare`. Trashed drawings return `none` for every non-owner, including active share links.

## Architectural trade-offs and constraints

ExcaliDash makes explicit design trade-offs to stay simple to self-host:

- **Single backend replica (`replicas: 1`):** Socket.IO runs with the default in-memory adapter and `roomUsers` lives in Node process memory (alongside the in-memory login rate limiter and short-lived drawings list cache). Running two backend instances behind a load balancer splits collaborators across separate processes so they stop seeing each other's live edits, and SQLite only supports a single writer host anyway.
- **Server-readable storage instead of E2E encryption:** unlike `excalidraw.com` + `excalidraw-room` (where decryption keys live only in the URL `#fragment`), ExcaliDash stores drawings in your database so the server can validate payloads, render previews, search by title, enforce per-user permissions, and retain version history. Protect traffic with HTTPS and restrict access to your database volume and backups.
- **SQLite-only built-in backup scheduler:** `BACKUP_SCHEDULE` relies on SQLite's `VACUUM INTO` command. PostgreSQL deployments should use `pg_dump` or managed database snapshots.

## Next steps

- [How to self-host Excalidraw with Docker Compose](/guides/self-host-excalidraw)
- [Self-host Excalidraw collaboration (`excalidraw-room` vs ExcaliDash)](/guides/excalidraw-collaboration-server)
- [Reverse proxy, HTTPS & WebSockets](/guides/excalidraw-reverse-proxy)
- [PostgreSQL & S3 storage](/guides/excalidraw-postgresql-s3)
- [Kubernetes, Proxmox & Unraid deployment](/deploy/kubernetes-proxmox-unraid)
