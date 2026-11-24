---
title: Excalidraw with PostgreSQL & S3
description: Run self-hosted Excalidraw on PostgreSQL 16 and store drawing images in AWS S3, Cloudflare R2, or MinIO with ExcaliDash Docker Compose.
---

# Self-hosted Excalidraw with PostgreSQL and S3 storage

ExcaliDash defaults to SQLite and local Docker volume storage so you can start with zero external dependencies. For larger teams, managed database backups, or multi-gigabyte image libraries, switch to **PostgreSQL** and **S3-compatible object storage** (AWS S3, Cloudflare R2, or MinIO).

## When to move from SQLite to PostgreSQL and S3

- **Stay on SQLite** if you run a personal homelab or small team on a single host and prefer single-file backups (`BACKUP_SCHEDULE`).
- **Switch to PostgreSQL** when you already operate a Postgres server, want point-in-time recovery (`pg_dump` / managed snapshots), or expect high concurrent multi-user writes.
- **Add S3 / R2 / MinIO** when teams paste large screenshots or assets into diagrams and you want uploaded images stored outside the container volume.

## PostgreSQL Docker Compose stack

Set `DATABASE_PROVIDER=postgresql` and supply a standard Postgres connection string in `DATABASE_URL`:

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

On startup, the backend entrypoint applies Prisma PostgreSQL migrations automatically. Always set explicit `JWT_SECRET` and `CSRF_SECRET` values in `.env` (generate with `openssl rand -hex 32`) when running PostgreSQL.

## S3-compatible image storage (AWS S3, Cloudflare R2, MinIO)

Setting `S3_BUCKET` switches uploaded drawing images from local disk to your S3-compatible bucket. Add the matching block to the `backend` environment:

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
- `S3_FORCE_PATH_STYLE: "true"` is required for MinIO and any endpoint that does not support virtual-hosted-style bucket subdomains.
- Omit `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` if running on AWS with an IAM instance role or IRSA.

## Backups and migration

### Backing up PostgreSQL

Use `pg_dump` on a cron schedule (note that ExcaliDash's built-in `BACKUP_SCHEDULE` targets SQLite only):

```bash
docker exec excalidash-postgres pg_dump -U excalidash -Fc excalidash > excalidash-$(date +%F).dump
```

Restore with:

```bash
docker exec -i excalidash-postgres pg_restore -U excalidash -d excalidash --clean --if-exists < excalidash-YYYY-MM-DD.dump
```

Always back up your S3 bucket alongside the database so image records stay consistent on restore, and keep `JWT_SECRET`, `CSRF_SECRET`, and `API_KEY_HASH_PEPPER` in your password manager or secrets store.

### Migrating drawings from SQLite to PostgreSQL

1. In your existing SQLite instance, export each workspace via **Settings → Export backup** (`.excalidash` archive containing drawings, collections, snapshots, and uploaded images).
2. Start the new PostgreSQL (and optional S3) ExcaliDash stack and create your accounts.
3. Import each `.excalidash` archive under **Settings → Advanced → Import backup**.

See [Storage, version history & backups](/guide/storage-backups) and [Environment variables reference](/reference/environment#images-and-backups) for all options.
