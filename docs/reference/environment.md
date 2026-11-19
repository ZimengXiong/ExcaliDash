---
title: ExcaliDash Environment Variables
description: Reference ExcaliDash environment variables for databases, authentication, OpenID Connect, backups, and server configuration.
---

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

With local authentication enabled, users sign in through the email and password form.

<ThemeScreenshot light="/images/screenshots/signin-light.png" dark="/images/screenshots/signin.png" alt="Email and password sign-in when local authentication is enabled" />

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

After configuring delivery, users can select **Forgot your password?** on the sign-in page to request a reset link.

<ThemeScreenshot light="/images/screenshots/password-reset-light.png" dark="/images/screenshots/password-reset.png" alt="Password reset request form when the feature is enabled" />

## MCP server

| Variable                         | Default   | Purpose                                                                 |
| -------------------------------- | --------- | ----------------------------------------------------------------------- |
| `MCP_ENABLED`                    | `false`   | Serve the built-in MCP endpoint at `/api/mcp` for AI agents             |
| `MCP_MAX_SESSIONS`               | `256`     | Maximum concurrent MCP sessions across all users                        |
| `MCP_MAX_SESSIONS_PER_KEY`       | `16`      | Maximum concurrent MCP sessions per API key                             |
| `MCP_SESSION_IDLE_MS`            | `1800000` | Idle time before an MCP session is closed (30 minutes)                  |
| `MCP_MODULE_PATH`                | unset     | Path to `mcp/dist/embedded.js`; found automatically next to the backend |
| `AGENT_OPS_RATE_LIMIT_MAX`       | `120`     | Drawing-agent op batches per user per window                            |
| `AGENT_OPS_RATE_LIMIT_WINDOW_MS` | `60000`   | Window for the drawing-agent op rate limit                              |

See [MCP server](/guide/mcp) for setup.
