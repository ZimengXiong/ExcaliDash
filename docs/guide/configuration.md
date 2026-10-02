# Configuration

Configure ExcaliDash with environment variables. `backend/.env.example` lists the backend settings.

## Local development

Copy the example files before starting the services:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Use the defaults for local development. Keep secrets in untracked `.env` files.

In `backend/.env`, replace the generated `<backend>` path placeholders:

```dotenv
DATABASE_URL=file:./dev.db
BACKUP_DIR=./backups
```

The relative SQLite path resolves under `backend/prisma/`.

## Docker Compose

Compose reads substitutions from your shell or a root `.env` file:

```dotenv
EXCALIDASH_TAG=latest
AUTH_MODE=local
FILE_UPLOAD_MAX_MB=100
```

The supplied Compose file passes these variables to the backend: `AUTH_MODE`, `FILE_UPLOAD_MAX_MB`, `JWT_SECRET`, and `CSRF_SECRET`. `EXCALIDASH_TAG` selects the images. Other settings require a Compose override; adding them to `.env` alone does not pass them into a container.

For example, create `compose.override.yml`:

```yaml
services:
  backend:
    environment:
      SNAPSHOT_RETENTION_DAYS: "7"
```

Start the services:

```bash
docker compose -f docker-compose.prod.yml -f compose.override.yml up -d
```

## Signing secrets

The Docker entrypoint generates and persists signing secrets if you leave them unset. To manage them yourself, generate two different values:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Set `JWT_SECRET` and `CSRF_SECRET` in the root `.env`. Keep them stable across restarts and out of Git. `JWT_SECRET` must contain at least 32 characters in production.

## Configuration rules

- Treat signing keys, database credentials, OIDC secrets, and mail credentials as secrets.
- Use the same image tag for the frontend and backend.
- Set `FRONTEND_URL` to the externally visible origin when the backend must allow cross-origin requests.
- Enable `TRUST_PROXY` only when a trusted proxy replaces client-supplied forwarding headers.
- Persist the database. Images are stored in the database by default; back up the bucket separately if you use S3.

See the [environment reference](/reference/environment).
