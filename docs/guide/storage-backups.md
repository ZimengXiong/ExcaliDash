---
title: Excalidraw Storage, Version History & Backups
description: Understand persistent Docker volumes, version history retention, .excalidash backup exports and recovery copies, and scheduled SQLite backups.
---

<script setup>
import { backupSlides } from "../.vitepress/theme/screenshot-flows";
</script>

# Storage and backups

ExcaliDash stores drawings, collections, version snapshots, and uploaded images on your server so your library stays available across browsers and devices. The default [Docker Compose stack](/deploy/docker) writes SQLite data to the `backend-data` volume; PostgreSQL and S3-compatible object storage are also supported via the [environment reference](/reference/environment).

## Persistent Docker storage

The `backend-data` volume stores:

- The SQLite database (drawings, collections, accounts, snapshots)
- Uploaded image files (when S3 is not configured)
- Auto-generated signing secrets (if `JWT_SECRET` / `CSRF_SECRET` are not provided explicitly)

Normal container restarts, image updates, and `docker compose down` preserve this volume. Running `docker compose down --volumes` deletes it permanently. A Docker volume protects against container restarts—not accidental deletion or disk loss—so keep separate backups.

## Account exports and recovery copies

In addition to importing and exporting individual `.excalidraw` files, you can export your entire workspace from **Settings → Export backup**.

The downloaded `.excalidash` archive includes your drawings, collections, drawing version history, and uploaded images. Snapshot images are deduplicated inside the archive so multi-version exports stay compact. External image URLs remain links and still rely on their remote host.

If an uploaded image is missing from server storage during export, ExcaliDash stops the normal export and offers **Export Recovery Copy** instead. A recovery copy packages every available drawing, history snapshot, and image, and lists the missing image references in the archive manifest so you know exactly what could not be included. Storage outages and unreadable corrupt files still fail both modes.

To restore or migrate an archive, expand **Advanced** under **Settings** and select **Choose file** under **Import backup**. ExcaliDash previews the drawing, collection, and missing-image counts before importing.

<ScreenshotCarousel label="Export and import a library backup" :slides="backupSlides" />

An account `.excalidash` export is ideal for moving your drawings between instances, but it does not back up server accounts, sharing settings, or environment secrets. Keep full database backups for server disaster recovery.

## Version history

Snapshots are recorded automatically as you edit a drawing. Open **Version history** in the editor header, click any version to preview it on the canvas, and select **Restore** (then **Confirm?**) to roll back.

The footer of the Version history panel displays your server's active `SNAPSHOT_RETENTION_DAYS` window (default: 2 days). An hourly sweep prunes snapshots older than that threshold.

<ThemeScreenshot light="/images/screenshots/drawing-history-light.png" dark="/images/screenshots/drawing-history.png" alt="Version history panel showing saved snapshots and restore controls" />

## Scheduled SQLite backups

To run automated SQLite backups inside Docker, configure `BACKUP_SCHEDULE`, `BACKUP_DIR`, and `BACKUP_RETENTION_DAYS` with a dedicated `backup-data` volume owned by UID `1001`. See [Persist and back up data](/deploy/docker#persist-and-back-up-data) for the full Compose override and ownership command.

Check backend logs after a scheduled run:

```bash
docker compose -f docker-compose.prod.yml logs --tail=100 backend
```

Scheduled backups copy the SQLite database file only. Store `JWT_SECRET`, `CSRF_SECRET`, and `API_KEY_HASH_PEPPER` separately, replicate backups off the host, and test restoring them periodically.

## PostgreSQL and S3 deployments

- **PostgreSQL:** use `pg_dump` or your managed database's snapshot schedule.
- **S3 storage:** back up or replicate the configured `S3_BUCKET` alongside your database so image references remain intact on restore.

Before upgrading ExcaliDash, take a fresh backup and record your current `EXCALIDASH_TAG`. See [Upgrade](/deploy/docker#upgrade).
