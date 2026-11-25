---
title: "Excalidraw Docker Not Saving Drawings: Causes & Persistent Storage Fix"
description: Fix self-hosted Excalidraw Docker not saving drawings. Why the official image only uses browser localStorage and how to add SQLite, PostgreSQL, or S3 storage.
---

# Excalidraw Docker not saving drawings: causes and persistent storage fix

The official `excalidraw/excalidraw` Docker image has no backend or database. It saves only the active canvas in your browser's `localStorage` (and pasted images in IndexedDB) scoped to one origin, so drawings disappear when you clear site data, switch devices, open an incognito window, or change hostnames. To add persistent server-side storage, either export `.excalidraw` files manually or run a backend such as ExcaliDash with SQLite or PostgreSQL.

## Symptoms and root causes

| Symptom                                                   | Cause                                                                                    |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Drawing disappears after clearing cookies or site data    | `localStorage` and IndexedDB for that origin were wiped                                  |
| Drawing is missing on another laptop or phone             | Each browser stores its own local copy; nothing writes to the server                     |
| Drawing vanishes after moving from an IP to a domain      | Browser storage is isolated by origin (`http://10.0.0.5:5000` ≠ `https://draw.lan`)      |
| Incognito or private window opens blank                   | Private sessions use temporary storage discarded on close                                |
| Opening a new canvas overwrites the previous one          | Upstream Excalidraw holds one active scene, not a library of saved drawings              |
| Pasted images break while shapes stay intact              | Image blobs live in IndexedDB separately from scene JSON and were evicted or cleared     |
| Mounting a Docker volume on the container changed nothing | `excalidraw/excalidraw` is static nginx and never writes drawing files to container disk |

## Why does `excalidraw/excalidraw` not save to the server?

`excalidraw/excalidraw` is a static Vite build served by nginx. It ships no REST API, no database, and no user accounts. Upstream persistence writes strictly to browser storage. The only server-backed features in upstream code (shareable links and collaboration rooms) point to Excalidraw's public servers unless you rebuild the frontend, and neither provides a saved workspace.

Attaching a bind mount or Docker volume to `excalidraw/excalidraw` cannot fix this because the container has no server process writing drawing data.

## Fix 1: Export `.excalidraw` files manually

If you only need a single-user scratchpad, press `Ctrl+S` / `Cmd+S` (or Menu → Save to…) to download a `.excalidraw` file and reopen it later with Open. It is manual, per file, and keeps you on the official image.

## Fix 2: Add an Excalidraw backend with persistent storage (ExcaliDash)

ExcaliDash wraps the Excalidraw editor with a Node.js backend that writes every drawing, image, and revision to your server:

| Data                         | Default storage                                                    | Optional backend                                       |
| ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| Drawings, collections, users | SQLite at `/app/prisma/dev.db` in the `backend-data` volume        | PostgreSQL via `DATABASE_PROVIDER=postgresql`          |
| Uploaded images              | Database blobs                                                     | AWS S3, Cloudflare R2, MinIO, B2, Wasabi (`S3_BUCKET`) |
| Version history              | Brotli-compressed snapshots (`SNAPSHOT_RETENTION_DAYS`, default 2) | None                                                   |
| Scheduled backups            | `BACKUP_DIR` when `BACKUP_SCHEDULE` is set (SQLite)                | `pg_dump` for PostgreSQL                               |

Start ExcaliDash with Docker Compose:

```bash
git clone https://github.com/ZimengXiong/ExcaliDash.git
cd ExcaliDash
docker compose -f docker-compose.prod.yml up -d
```

Open `http://localhost:6767`, create your administrator account, and import any existing `.excalidraw` files from the dashboard. Drawings now stay on your server and sync across browsers and devices.

For a standalone Compose file with pinned tags, see [How to self-host Excalidraw](/guides/self-host-excalidraw#step-1-create-docker-compose-yml). For PostgreSQL and S3, see [PostgreSQL & S3 storage](/guides/excalidraw-postgresql-s3).

## Keeping ExcaliDash data persistent

Keep the `backend-data` named volume intact: `docker compose down` preserves named volumes, while `docker compose down --volumes` deletes every drawing and user account. If you replace the named volume with a host bind mount, set ownership to UID `1001` (`chown -R 1001:1001 <dir>`) so the non-root backend process can write.

For ongoing safety, enable `BACKUP_SCHEDULE` for automated SQLite `VACUUM INTO` backups (see [Persist and back up data](/deploy/docker#persist-and-back-up-data)) and export a full `.excalidash` archive under Settings → Export backup before host migrations.

## Related guides

- [How ExcaliDash works](/guides/how-excalidash-works)
- [Self-host Excalidraw collaboration](/guides/excalidraw-collaboration-server)
- [Self-hosted Excalidraw projects compared](/guides/self-hosted-excalidraw-projects)
- [Storage, version history & backups](/guide/storage-backups)
