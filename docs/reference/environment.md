# Environment reference

Common settings are listed below. See `backend/src/config/registry/` for all variables, defaults, and validation rules.

## Core

| Variable       | Default       | Purpose                                                              |
| -------------- | ------------- | -------------------------------------------------------------------- |
| `PORT`         | `8000`        | Backend HTTP port                                                    |
| `BACKEND_HOST` | `0.0.0.0`     | Backend listen address; use `127.0.0.1` for a private local server   |
| `NODE_ENV`     | `development` | Enables production validation and hardening when set to `production` |
| `FRONTEND_URL` | unset         | Comma-separated allowed frontend origins                             |
| `TRUST_PROXY`  | `false`       | Express proxy trust; use a positive hop count behind a trusted proxy |

## Data

| Variable                  | Default                        | Purpose                                            |
| ------------------------- | ------------------------------ | -------------------------------------------------- |
| `DATABASE_PROVIDER`       | `sqlite` in production Compose | Docker entrypoint selects `sqlite` or `postgresql` |
| `DATABASE_URL`            | local SQLite file              | Prisma connection string                           |
| `SNAPSHOT_RETENTION_DAYS` | `2`                            | Drawing snapshot retention period                  |
| `UPLOAD_MAX_MB`           | `100`                          | Import and database-restore upload limit           |
| `FILE_UPLOAD_MAX_MB`      | `100`                          | Per-image upload limit                             |
| `BODY_LIMIT_MB`           | `50`                           | Scene request body and Socket.IO buffer limit      |

The frontend image limits HTTP request bodies to 50 MB in `frontend/nginx.conf.template`.

## Authentication

| Variable                      | Default                                 | Purpose                                                    |
| ----------------------------- | --------------------------------------- | ---------------------------------------------------------- |
| `AUTH_MODE`                   | `local`                                 | `local`, `hybrid`, `oidc_enforced`, or `disabled`          |
| `JWT_SECRET`                  | generated in some single-instance flows | Signs authentication tokens; set a stable production value |
| `CSRF_SECRET`                 | generated in some single-instance flows | Protects state-changing browser requests                   |
| `JWT_ACCESS_EXPIRES_IN`       | `15m`                                   | Access-token lifetime                                      |
| `JWT_REFRESH_EXPIRES_IN`      | `7d`                                    | Refresh-token lifetime                                     |
| `BOOTSTRAP_SETUP_CODE_TTL_MS` | `900000`                                | First administrator setup-code lifetime (15 minutes)       |

## OpenID Connect

Set `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and `OIDC_REDIRECT_URI`. Set `AUTH_MODE` to `hybrid` or `oidc_enforced`.

Use `https://YOUR_HOST/api/auth/oidc/callback` as the redirect URI. It must match the provider registration. See [authentication](/guide/authentication).

## Images and backups

| Variable                | Default                      | Purpose                                           |
| ----------------------- | ---------------------------- | ------------------------------------------------- |
| `S3_BUCKET`             | unset                        | Enables S3 image storage                          |
| `S3_REGION`             | `us-east-1`                  | Bucket region                                     |
| `S3_ENDPOINT`           | unset                        | Endpoint for an S3-compatible service             |
| `S3_PUBLIC_URL`         | unset                        | Public object URL; required for non-AWS endpoints |
| `BACKUP_SCHEDULE`       | unset                        | SQLite backup cron schedule; unset disables it    |
| `BACKUP_DIR`            | backend `backups/` directory | Directory for database backups                    |
| `BACKUP_RETENTION_DAYS` | `14`                         | Days to retain database backups                   |

See [backup configuration](/deploy/docker#persist-and-back-up-data) for a Compose example.

## Email and password reset

Set `ENABLE_PASSWORD_RESET=true`, select `MAIL_TRANSPORT`, and configure either SMTP or Resend credentials. `MAIL_FROM` controls the visible sender.
