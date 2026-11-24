---
title: Self-Hosted Excalidraw+ Alternative
description: Open-source self-hosted alternative to Excalidraw+ with persistent drawings, collections, live collaboration, version history, and OIDC SSO.
---

# Self-hosted Excalidraw+ alternative

Excalidraw's open-source canvas is fast and familiar, but teams who want cloud-style workspaces—saved drawings across devices, folders, permissions, live multiplayer collaboration, and version history—normally have to pay for **Excalidraw+** or stitch together custom backends.

**ExcaliDash** is an open-source (GNU LGPL v3.0) self-hosted workspace built around the Excalidraw editor. It gives individuals, homelabs, and engineering teams a persistent dashboard, collections, built-in real-time collaboration, automatic version snapshots, and native OIDC SSO on their own servers.

ExcaliDash is an independent project and is not affiliated with Excalidraw.

## ExcaliDash vs Excalidraw+ vs official Excalidraw Docker

| Capability                     | Official `excalidraw/excalidraw`          | Excalidraw+ (Hosted Cloud)                     | ExcaliDash (Self-Hosted)                                                |
| ------------------------------ | ----------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| Deployment model               | Self-hosted static frontend               | Managed SaaS (enterprise self-host on request) | Self-hosted Docker Compose (SQLite or PostgreSQL)                       |
| Saved drawings across devices  | No (browser `localStorage` only)          | Yes                                            | Yes (server-side database)                                              |
| Collections / folders & search | No                                        | Yes                                            | Yes                                                                     |
| Real-time collaboration        | Public server or custom `excalidraw-room` | Yes                                            | Yes (built-in Socket.IO + named cursors + follow mode)                  |
| Permissions & link sharing     | Anonymous room links                      | Workspace roles & links                        | Per-drawing & per-collection view/edit + expiring links                 |
| Version history & restore      | No                                        | Yes                                            | Yes (automatic snapshots, configurable retention)                       |
| Authentication & SSO           | No                                        | Managed accounts / SSO                         | Local accounts + native OIDC (Authentik, Keycloak, Pocket ID, Authelia) |
| Image storage                  | Embedded in local scene                   | Managed cloud                                  | Local volume or S3 / MinIO / Cloudflare R2                              |
| File portability               | `.excalidraw`                             | `.excalidraw`                                  | Standard `.excalidraw` + full `.excalidash` workspace archives          |
| Automation & API               | No                                        | Limited                                        | Scoped personal API keys (`exd_...`) for REST & Socket.IO               |
| License & pricing              | MIT (free)                                | Paid per-seat subscription                     | GNU LGPL v3.0 (free, unlimited users)                                   |

## What ExcaliDash includes out of the box

### Visual dashboard, collections, and search

Instead of hunting through local downloads for `architecture-final-v3.excalidraw`, ExcaliDash renders light and dark previews for every drawing in a searchable dashboard. Group diagrams into collections, sort by update time or title, and switch devices without losing state.

<ThemeScreenshot light="/images/workspace-light.png" dark="/images/workspace.png" alt="ExcaliDash self-hosted Excalidraw dashboard with drawing previews and collections" />

### Self-hosted real-time collaboration and follow mode

Share a single drawing or an entire collection with teammates using **View** or **Edit** permissions, or generate an optional expiring link for external reviewers. Active collaborators appear in the editor header with live named cursors, and clicking any avatar follows that presenter's viewport during design reviews.

<ThemeScreenshot light="/images/collaboration-light.png" dark="/images/collaboration-dark.png" alt="Real-time Excalidraw collaboration with live cursors and presence avatars in ExcaliDash" />

### Automatic version history and zero lock-in exports

ExcaliDash captures snapshots automatically as you edit (controlled by `SNAPSHOT_RETENTION_DAYS` and `SNAPSHOT_MIN_INTERVAL_SECONDS`). Open **Version history** in the editor header to preview any earlier state directly on the canvas and restore it in two clicks.

Your diagrams stay portable: export any canvas as a standard `.excalidraw` file anytime, or download a `.excalidash` archive containing your drawings, collections, snapshots, and deduplicated uploaded images.

<ThemeScreenshot light="/images/screenshots/drawing-history-light.png" dark="/images/screenshots/drawing-history.png" alt="ExcaliDash version history panel showing snapshots and restore controls" />

### Team authentication with OIDC SSO and API keys

Start with local accounts or integrate your existing identity provider using `AUTH_MODE=hybrid` or `AUTH_MODE=oidc_enforced`. ExcaliDash supports just-in-time user provisioning and automatic admin assignment from IdP group claims—plus scoped `exd_...` API keys for scripts and integrations.

## How to migrate from Excalidraw or Excalidraw+

1. **Export existing scenes:** Save your drawings as `.excalidraw` files from `excalidraw.com` or Excalidraw+.
2. **Deploy ExcaliDash:** Start the Docker Compose stack on your server or homelab.
3. **Import into your workspace:** Use the dashboard import flow (or drag `.excalidraw` files directly into a canvas when **Append dropped drawings** is enabled in Settings) and organize them into collections.

## When another tool might be a better fit

- **Choose official Excalidraw+** if you want zero infrastructure management, mobile apps, or official commercial SLAs directly from the Excalidraw team.
- **Choose Nextcloud Whiteboard** if your organization already runs Nextcloud and wants whiteboards stored directly inside Nextcloud Files without running another app.
- **Choose AFFiNE or Penpot** if you want a full Notion-style document/database suite or a Figma-class vector UI design tool rather than Excalidraw's hand-drawn diagramming workflow.

## Deploy ExcaliDash now

```bash
git clone https://github.com/ZimengXiong/ExcaliDash.git
cd ExcaliDash
docker compose -f docker-compose.prod.yml up -d
```

Open `http://localhost:6767` to create your administrator account, then continue with:

- [How to self-host Excalidraw with Docker Compose](/guides/self-host-excalidraw)
- [Configure OIDC / SSO (Authentik, Keycloak, Pocket ID, Authelia)](/guides/excalidraw-oidc-sso)
- [Reverse proxy, HTTPS & WebSocket setup](/guides/excalidraw-reverse-proxy)
- [PostgreSQL & S3 storage](/guides/excalidraw-postgresql-s3)
