---
title: Configuration
description: Configure ExcaliDash environment variables, Docker overrides, signing secrets, and per-account workspace preferences.
---

# Configuration

Server behavior is configured through environment variables; editor and appearance preferences are stored per account in **Settings**.

## Local development

Copy the example environment files before starting the services:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Keep secrets in untracked `.env` files. In `backend/.env`, replace the placeholder paths with local paths:

```dotenv
DATABASE_URL=file:./dev.db
BACKUP_DIR=./backups
```

## Docker Compose

Docker Compose reads variable substitutions from your shell or a `.env` file next to `docker-compose.prod.yml`:

```dotenv
EXCALIDASH_TAG=latest
AUTH_MODE=local
FILE_UPLOAD_MAX_MB=100
```

Put extra backend or frontend overrides in `compose.override.yml`:

```yaml
services:
  backend:
    environment:
      SNAPSHOT_RETENTION_DAYS: "7"
```

Apply the override:

```bash
docker compose -f docker-compose.prod.yml -f compose.override.yml up -d
```

## Workspace preferences

Open the account menu and select **Settings** to adjust preferences for your account:

- **Language:** switch between `English`, `简体中文`, or an Excalidraw editor language.
- **Appearance:** choose `Light`, `Dark`, or `System` to follow your operating system color scheme automatically.
- **Auto-hide editor header:** collapse the top bar automatically when opening a drawing.
- **Compact sidebar:** keep account actions tucked into the avatar menu.
- **Append dropped drawings:** when enabled, dragging one or more `.excalidraw` files onto an open canvas appends their elements to the current drawing (laid out cleanly without overlapping) instead of replacing the canvas.
- **Optimized images:** compress uploaded images above a configurable MB threshold, or turn off to preserve original quality.
- **Export backup:** download a full `.excalidash` archive of your workspace.

Opening a drawing automatically fits large canvases to your viewport (capped at 100% zoom) so the scene is centered on screen, unless the URL targets a specific `?element=` anchor.

<ThemeScreenshot light="/images/screenshots/settings-light.png" dark="/images/screenshots/settings.png" alt="Settings page showing appearance, editor, image optimization, and backup controls" />

## Signing secrets

In single-instance Docker deployments, the entrypoint generates and persists `JWT_SECRET` and `CSRF_SECRET` inside `backend-data` if they are unset. To manage them explicitly—recommended for backups and multi-instance setups—generate two distinct secrets:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Place both in your root `.env` file and keep them out of Git. Production requires `JWT_SECRET` to be at least 32 characters long.

Browse all options in the [Environment reference](/reference/environment).
