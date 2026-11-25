---
title: "Self-Hosted Excalidraw with PostgreSQL & S3 Storage (R2, MinIO, AWS)"
description: Run self-hosted Excalidraw with persistent PostgreSQL 16 storage and offload drawing images to AWS S3, Cloudflare R2, or MinIO in ExcaliDash Docker Compose.
---

# Self-hosted Excalidraw with PostgreSQL and S3 storage

To run self-hosted Excalidraw on PostgreSQL instead of SQLite, set `DATABASE_PROVIDER=postgresql` and a `postgresql://` connection string in `DATABASE_URL` on `excalidash-backend`; PostgreSQL migrations run automatically on startup. To store pasted images outside the database, set `S3_BUCKET` (along with `S3_ENDPOINT`, `S3_PUBLIC_URL`, and `S3_FORCE_PATH_STYLE` for non-AWS endpoints) for AWS S3, Cloudflare R2, MinIO, Backblaze B2, or Wasabi.

ExcaliDash ships with both SQLite and PostgreSQL clients prebuilt inside the backend image, so switching databases requires no custom image build.

## When to move off SQLite

Stay on SQLite for a homelab or small team on one host that prefers single-file automated backups (`BACKUP_SCHEDULE`). Move to PostgreSQL if you already operate a Postgres cluster, rely on `pg_dump` or managed point-in-time recovery, or see heavy concurrent multi-user writes. Enable S3, R2, or MinIO when users paste large images or screenshots and you want binary assets kept in object storage instead of database rows.

## PostgreSQL Docker Compose stack

Set `DATABASE_PROVIDER=postgresql` and supply `DATABASE_URL`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: excalidash-postgres
    environment:
      POSTGRES_USER: excalidash
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD}
      POSTGRES_DB: excalidash
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - excalidash-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U excalidash -d excalidash"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  backend:
    image: zimengxiong/excalidash-backend:0.7.0
    container_name: excalidash-backend
    init: true
    environment:
      DATABASE_PROVIDER: postgresql
      DATABASE_URL: postgresql://excalidash:${POSTGRES_PASSWORD}@postgres:5432/excalidash
      PORT: 8000
      NODE_ENV: production
      AUTH_MODE: local
      FRONTEND_URL: https://draw.example.com
      TRUST_PROXY: "1"
      JWT_SECRET: ${JWT_SECRET:?Set JWT_SECRET}
      CSRF_SECRET: ${CSRF_SECRET:?Set CSRF_SECRET}
    volumes:
      - backend-uploads:/app/uploads
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - excalidash-network
    restart: unless-stopped

  frontend:
    image: zimengxiong/excalidash-frontend:0.7.0
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
  pgdata:
  backend-uploads:
```

On startup, the backend selects the prebuilt PostgreSQL client and applies schema migrations automatically. Set explicit `JWT_SECRET` and `CSRF_SECRET` values in `.env` (`openssl rand -hex 32`) whenever running PostgreSQL.

## S3-compatible image storage (AWS S3, Cloudflare R2, MinIO)

Setting `S3_BUCKET` directs pasted image uploads into your bucket instead of the database. Add the block matching your provider under `backend.environment`:

::: code-group

```yaml [AWS S3]
environment:
  S3_BUCKET: my-excalidash-images
  S3_REGION: us-east-1
  S3_KEY_PREFIX: excalidash
  AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID}
  AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY}
```

```yaml [Cloudflare R2]
environment:
  S3_BUCKET: excalidash-images
  S3_REGION: auto
  S3_ENDPOINT: https://<ACCOUNT_ID>.r2.cloudflarestorage.com
  S3_PUBLIC_URL: https://assets.example.com
  S3_KEY_PREFIX: excalidash
  AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID}
  AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY}
```

```yaml [MinIO]
environment:
  S3_BUCKET: excalidash
  S3_REGION: us-east-1
  S3_ENDPOINT: http://minio:9000
  S3_PUBLIC_URL: https://s3.example.com/excalidash
  S3_FORCE_PATH_STYLE: "true"
  S3_KEY_PREFIX: excalidash
  AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID}
  AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY}
```

:::

- `S3_PUBLIC_URL` is required for non-AWS endpoints (R2, MinIO, Backblaze B2, Wasabi).
- `S3_FORCE_PATH_STYLE: "true"` is required for MinIO and other endpoints without virtual-hosted-style bucket subdomains.
- Omit `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` on AWS when using an IAM instance role or IRSA.

## Backups and migration

### Backing up PostgreSQL

Schedule `pg_dump` via cron or your database provider (ExcaliDash's built-in `BACKUP_SCHEDULE` targets SQLite only):

```bash
docker exec excalidash-postgres pg_dump -U excalidash -Fc excalidash > excalidash-$(date +%F).dump
```

Restore with:

```bash
docker exec -i excalidash-postgres pg_restore -U excalidash -d excalidash --clean --if-exists < excalidash-YYYY-MM-DD.dump
```

Back up your S3 bucket alongside PostgreSQL so database records stay in sync with stored objects, and keep `JWT_SECRET`, `CSRF_SECRET`, and `API_KEY_HASH_PEPPER` stored outside the cluster.

### Migrating from SQLite to PostgreSQL

1. In your SQLite instance, export each user's workspace from Settings → Export backup (downloads a `.excalidash` archive containing drawings, collections, version snapshots, and uploaded images).
2. Start the PostgreSQL (and optional S3) ExcaliDash stack and create the accounts.
3. Import each `.excalidash` archive under Settings → Advanced → Import backup.

See [Storage, version history & backups](/guide/storage-backups) and [Environment variables reference](/reference/environment#images-and-backups) for all storage flags.
