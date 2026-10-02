# Deploy with Docker Compose

Deploy the frontend and backend with a persistent SQLite database. Complete the [quick start](/guide/quick-start) first.

## Select an image version

Set the image tag in the root `.env`:

```dotenv
EXCALIDASH_TAG=latest
```

Pull and start both images:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Pin a release for repeatable deployments. Use the same version for both images.

## Configure HTTPS

Route HTTPS traffic to container port `8080` or host port `6767`. The frontend proxies API and real-time traffic to the backend.

Create `compose.override.yml` with your public origin and the number of trusted proxy hops:

```yaml
services:
  backend:
    environment:
      FRONTEND_URL: https://draw.example.com
      TRUST_PROXY: "1"
```

Replace `https://draw.example.com` with your URL. The hop count must match your proxy chain. Your proxies must replace untrusted forwarding headers and forward WebSocket upgrades for `/socket.io/`.

Apply the override:

```bash
docker compose -f docker-compose.prod.yml -f compose.override.yml up -d
```

Use both `-f` flags for later commands if you use an override.

## Persist and back up data

The `backend-data` volume holds SQLite data, image records, and generated signing secrets. Scheduled backups copy the SQLite database; save your signing secrets separately.

Add these entries to `compose.override.yml` to enable daily database backups at 04:00 in the container's timezone:

```yaml
services:
  backend:
    environment:
      BACKUP_SCHEDULE: "0 0 4 * * *"
      BACKUP_DIR: /app/backups
      BACKUP_RETENTION_DAYS: "14"
    volumes:
      - backup-data:/app/backups
volumes:
  backup-data:
```

Initialize the backup volume for the backend's user (UID 1001), then apply the override:

```bash
docker compose -f docker-compose.prod.yml -f compose.override.yml run --rm --no-deps --user 0 --entrypoint sh backend -c 'chown 1001:1001 /app/backups'
docker compose -f docker-compose.prod.yml -f compose.override.yml up -d
```

Check the backend logs for backup errors and test restoring a backup. For PostgreSQL, use your database's backup tools. If you use S3, back up its objects too.

## Upgrade

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Compose replaces changed containers while retaining named volumes. Check the service health and logs after every upgrade.

Back up before upgrading. Selecting an older image does not undo database
migrations or changes to stored data formats; a rollback may also require
restoring the matching database backup.

## Operational checklist

- HTTPS is enforced at the edge.
- Secrets are stable, unique, and stored outside version control.
- Database and backup volumes are persistent.
- Authentication behavior has been tested in a private session.
- Upload-size limits match the reverse proxy limits.
- A rollback image tag and a tested restore path are available.
