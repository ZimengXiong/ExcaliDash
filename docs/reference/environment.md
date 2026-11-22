---
title: Environment Variables Reference
description: Reference for ExcaliDash environment variables covering server settings, databases, authentication, OpenID Connect, S3 storage, backups, and email.
---

# Environment reference

Key runtime variables are listed below. For the complete schema, types, and validation rules, inspect `backend/src/config/registry/`.

## Core

| Variable       | Default       | Purpose                                                              |
| -------------- | ------------- | -------------------------------------------------------------------- |
| `PORT`         | `8000`        | Backend HTTP listen port                                             |
| `BACKEND_HOST` | `0.0.0.0`     | Listen address; use `127.0.0.1` for loopback-only local servers      |
| `NODE_ENV`     | `development` | Enables production validation and security checks when `production`  |
| `FRONTEND_URL` | unset         | Comma-separated CORS allowlist of frontend origins; detects HTTPS    |
| `TRUST_PROXY`  | `false`       | Express proxy trust (`false`, `true`, or positive trusted hop count) |

## Data and limits

| Variable                        | Default            | Purpose                                                                                                                                                                                                                                                    |
| ------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_PROVIDER`             | `sqlite` (Compose) | Selects `sqlite` or `postgresql` in the Docker entrypoint                                                                                                                                                                                                  |
| `DATABASE_URL`                  | local SQLite file  | Prisma connection string                                                                                                                                                                                                                                   |
| `SNAPSHOT_RETENTION_DAYS`       | `2`                | Days to keep drawing snapshots before pruning; shown in the Version history UI                                                                                                                                                                             |
| `SNAPSHOT_MIN_INTERVAL_SECONDS` | `0`                | Seconds between history snapshots for ordinary scene PUTs. At `0` each scene PUT takes a snapshot. With positive values, ordinary saves coalesce within the interval. Drops of more than 10% of live elements and history restores always take a snapshot. |
| `UPLOAD_MAX_MB`                 | `100`              | Max upload size for `.excalidash` imports and database restores                                                                                                                                                                                            |
| `FILE_UPLOAD_MAX_MB`            | `100`              | Max size for a single uploaded drawing image                                                                                                                                                                                                               |
| `BODY_LIMIT_MB`                 | `50`               | Max size for scene JSON payloads and Socket.IO buffers                                                                                                                                                                                                     |

The frontend container sets a 50 MB HTTP body limit in `frontend/nginx.conf.template`.

## Authentication and security

| Variable                      | Default                         | Purpose                                                                    |
| ----------------------------- | ------------------------------- | -------------------------------------------------------------------------- |
| `AUTH_MODE`                   | `local`                         | `local`, `hybrid`, `oidc_enforced`, or `disabled`                          |
| `JWT_SECRET`                  | auto-generated in Docker volume | Signs access and refresh tokens; minimum 32 chars in production            |
| `CSRF_SECRET`                 | auto-generated in Docker volume | Signs CSRF tokens for state-changing browser requests                      |
| `API_KEY_HASH_PEPPER`         | unset                           | Pepper mixed into API-key hashes; set before creating keys in production   |
| `JWT_ACCESS_EXPIRES_IN`       | `15m`                           | Access token lifetime                                                      |
| `JWT_REFRESH_EXPIRES_IN`      | `7d`                            | Refresh token lifetime                                                     |
| `BOOTSTRAP_SETUP_CODE_TTL_MS` | `900000`                        | First administrator setup-code lifetime in milliseconds (15 minutes)       |
| `ENFORCE_HTTPS_REDIRECT`      | `true`                          | Redirects HTTP to HTTPS when a secure origin is configured                 |
| `PASSWORD_MIN_LENGTH`         | `12`                            | Minimum password length (policy toggles also exist for case/number/symbol) |

With local authentication enabled, users sign in with email and password:

<ThemeScreenshot light="/images/screenshots/signin-light.png" dark="/images/screenshots/signin.png" alt="Email and password sign-in when local authentication is enabled" />

## OpenID Connect

Enable OIDC by setting `AUTH_MODE` to `hybrid` or `oidc_enforced` alongside your provider settings:

| Variable                | Default                | Purpose                                                        |
| ----------------------- | ---------------------- | -------------------------------------------------------------- |
| `OIDC_ISSUER_URL`       | unset                  | Provider issuer URL                                            |
| `OIDC_CLIENT_ID`        | unset                  | Client ID registered with the provider                         |
| `OIDC_CLIENT_SECRET`    | unset                  | Confidential client secret (or use `OIDC_CLIENT_SECRET_FILE`)  |
| `OIDC_REDIRECT_URI`     | unset                  | Exact callback URL: `https://YOUR_HOST/api/auth/oidc/callback` |
| `OIDC_PROVIDER_NAME`    | `OIDC`                 | Button label shown on the sign-in screen                       |
| `OIDC_SCOPES`           | `openid profile email` | Space-separated OIDC scopes                                    |
| `OIDC_JIT_PROVISIONING` | `true`                 | Create user accounts automatically on first OIDC login         |
| `OIDC_FIRST_USER_ADMIN` | `true`                 | Grant administrator role to the first provisioned OIDC user    |
| `OIDC_GROUPS_CLAIM`     | `groups`               | ID-token claim carrying group memberships                      |
| `OIDC_ADMIN_GROUPS`     | unset                  | Comma-separated groups that map to administrator access        |

See [Configure OpenID Connect](/guide/authentication#configure-openid-connect) for a complete Compose override.

## Images and backups

| Variable                | Default             | Purpose                                                           |
| ----------------------- | ------------------- | ----------------------------------------------------------------- |
| `S3_BUCKET`             | unset               | Bucket name; setting this switches image uploads to S3            |
| `S3_REGION`             | `us-east-1`         | Bucket region                                                     |
| `S3_ENDPOINT`           | unset               | Custom endpoint for MinIO, R2, or other S3-compatible services    |
| `S3_PUBLIC_URL`         | unset               | Public base URL for objects; required for non-AWS endpoints       |
| `S3_FORCE_PATH_STYLE`   | `false`             | Use path-style URLs (needed for MinIO)                            |
| `S3_KEY_PREFIX`         | `excalidash`        | Object key prefix inside the bucket                               |
| `BACKUP_SCHEDULE`       | unset               | 5- or 6-field cron schedule for SQLite backups; unset disables it |
| `BACKUP_DIR`            | `<backend>/backups` | Directory where scheduled backups are written                     |
| `BACKUP_RETENTION_DAYS` | `14`                | Days to retain scheduled database backups                         |

See [Persist and back up data](/deploy/docker#persist-and-back-up-data) for a Compose backup volume example.

## Email and password reset

| Variable                | Default | Purpose                                                         |
| ----------------------- | ------- | --------------------------------------------------------------- |
| `ENABLE_PASSWORD_RESET` | `false` | Enables the password reset flow on the sign-in page             |
| `MAIL_TRANSPORT`        | unset   | `smtp`, `resend`, or `none`                                     |
| `MAIL_FROM`             | unset   | Visible sender address, e.g. `ExcaliDash <noreply@example.com>` |
| `RESEND_API_KEY`        | unset   | API key when using Resend                                       |
| `SMTP_HOST`             | unset   | SMTP server hostname                                            |
| `SMTP_PORT`             | `587`   | SMTP port (`SMTP_SECURE=true` for implicit TLS on port `465`)   |
| `SMTP_USER`             | unset   | Optional SMTP username (pair with `SMTP_PASSWORD`)              |

Once configured, **Forgot your password?** appears on the sign-in page:

<ThemeScreenshot light="/images/screenshots/password-reset-light.png" dark="/images/screenshots/password-reset.png" alt="Password reset request form when email delivery is enabled" />
