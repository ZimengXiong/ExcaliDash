---
title: "Self-Hosted Excalidraw+ Alternative: Open-Source Docker Workspace"
description: Self-hosted Excalidraw+ alternative with saved drawings, collections, real-time collaboration, version history, and OIDC SSO. Free LGPL-3.0 Docker stack.
---

# Self-hosted Excalidraw+ alternative

Excalidraw+ is a hosted SaaS subscription and cannot be self-hosted today; self-hosting remains on its roadmap backlog with no release date. ExcaliDash is an open-source (LGPL-3.0) Excalidraw+ alternative you run with Docker Compose, adding persistent drawings, collections, built-in real-time collaboration, version history, and OIDC SSO on your own server.

Teams that like the open-source Excalidraw canvas usually end up choosing between paying per seat for Excalidraw+ or wiring together custom persistence and room servers. ExcaliDash puts the Excalidraw editor inside a self-hosted workspace backed by SQLite or PostgreSQL and a same-origin Socket.IO server.

ExcaliDash is an independent project and is not affiliated with Excalidraw.

## Excalidraw+ vs ExcaliDash vs the official Docker image

| Capability                     | Official `excalidraw/excalidraw`          | Excalidraw+ (Hosted Cloud)                | ExcaliDash (Self-Hosted)                                                |
| ------------------------------ | ----------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------- |
| Deployment model               | Self-hosted static frontend               | Hosted SaaS only (no self-hosted edition) | Self-hosted Docker Compose (SQLite or PostgreSQL)                       |
| Saved drawings across devices  | No (browser `localStorage` only)          | Yes                                       | Yes (server-side database)                                              |
| Collections / folders & search | No                                        | Yes                                       | Yes                                                                     |
| Real-time collaboration        | Public server or custom `excalidraw-room` | Yes                                       | Yes (built-in Socket.IO + named cursors + follow mode)                  |
| Permissions & link sharing     | Anonymous room links                      | Workspace roles & links                   | Per-drawing & per-collection view/edit + expiring links                 |
| Version history & restore      | No                                        | Yes                                       | Yes (automatic snapshots, configurable retention)                       |
| Authentication & SSO           | No                                        | Managed accounts / SSO                    | Local accounts + native OIDC (Authentik, Keycloak, Pocket ID, Authelia) |
| Image storage                  | Embedded in local scene                   | Managed cloud                             | Database blobs or S3 / MinIO / Cloudflare R2                            |
| File portability               | `.excalidraw`                             | `.excalidraw`                             | Standard `.excalidraw` + full `.excalidash` workspace archives          |
| Automation & API               | No                                        | API keys                                  | Scoped personal API keys (`exd_...`) for REST & Socket.IO               |
| License & pricing              | MIT (free)                                | Paid per-seat subscription                | GNU LGPL v3.0 (free, unlimited users)                                   |

## What ExcaliDash includes

### Dashboard, collections, and search

Every drawing renders light and dark SVG previews on a searchable dashboard. Group diagrams into collections, sort by update time or name, and open the same workspace from any browser or device.

<ThemeScreenshot light="/images/workspace-light.png" dark="/images/workspace.png" alt="ExcaliDash self-hosted Excalidraw dashboard with drawing previews and collections" />

### Self-hosted real-time collaboration and follow mode

Share a drawing or an entire collection with teammates at View or Edit level, or issue a link with an optional expiration date for outside reviewers. Active participants appear in the editor header with live named cursors, and clicking any avatar follows their viewport during reviews.

<ThemeScreenshot light="/images/collaboration-light.png" dark="/images/collaboration-dark.png" alt="Real-time Excalidraw collaboration with live cursors and presence avatars in ExcaliDash" />

### Automatic version history and portable exports

ExcaliDash stores compressed snapshots automatically as you edit (configured via `SNAPSHOT_RETENTION_DAYS` and `SNAPSHOT_MIN_INTERVAL_SECONDS`). Open Version history in the editor header to preview any earlier state on the canvas and restore it in two clicks.

Export any drawing as a standard `.excalidraw` file at any time, or download a `.excalidash` workspace archive with all drawings, collections, snapshots, and images.

<ThemeScreenshot light="/images/screenshots/drawing-history-light.png" dark="/images/screenshots/drawing-history.png" alt="ExcaliDash version history panel showing snapshots and restore controls" />

### Team authentication with OIDC SSO and API keys

Run local accounts, or connect your identity provider with `AUTH_MODE=hybrid` or `AUTH_MODE=oidc_enforced`. ExcaliDash supports just-in-time provisioning, IdP group-to-admin mapping (`OIDC_ADMIN_GROUPS`), and scoped `exd_...` API keys for scripts and REST/Socket.IO integrations.

## Can you self-host Excalidraw+?

No. Excalidraw+ is only available as Excalidraw's hosted cloud service. Self-hosting sits under Backlog on the [Excalidraw+ roadmap](https://plus.excalidraw.com/roadmap), and the [Excalidraw+ self-hosting docs](https://plus.excalidraw.com/docs/self-hosting/excalidraw-plus-self-hosting) describe it as a future Enterprise-license option with a waitlist and no release date. Organizations that need diagrams on their own infrastructure today run the open-source editor paired with a self-hosted backend such as ExcaliDash.

## How to migrate from Excalidraw or Excalidraw+

1. Download your existing drawings as `.excalidraw` files from `excalidraw.com` or Excalidraw+.
2. Bring up the ExcaliDash Docker Compose stack on your server or homelab.
3. Upload `.excalidraw` files from the dashboard (or drop them onto a canvas with Append dropped drawings enabled in Settings) and sort them into collections.

ExcaliDash migrates via `.excalidraw` files rather than a direct Excalidraw+ API importer. If you need direct API import from Excalidraw+, see [Excaliself in our projects comparison](/guides/self-hosted-excalidraw-projects#excaliself).

## When another tool fits better

Choose official Excalidraw+ if you want zero infrastructure to operate and paid support from the Excalidraw team. Choose Nextcloud Whiteboard if your team already runs Nextcloud and wants whiteboards stored inside Nextcloud Files. Choose AFFiNE or Penpot if you want a Notion-style docs-and-databases workspace or a Figma-class vector UI tool instead of Excalidraw's diagramming workflow.

## Other open-source Excalidraw+ alternatives on GitHub

Several community projects add persistence or collaboration to the Excalidraw editor, including Excaliself, excalidraw-full, alswl/excalidraw-collaboration, excalidraw-persist, and AstraDraw. See [self-hosted Excalidraw projects compared](/guides/self-hosted-excalidraw-projects) for a side-by-side breakdown.

Outside the Excalidraw ecosystem:

| Project                                          | What it is                                                              | License                             | Best fit                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------- |
| [AFFiNE](https://github.com/toeverything/AFFiNE) | Docs, whiteboard canvas, and databases in one workspace; self-hostable  | MIT; server under AFFiNE EE license | Notion-style knowledge base with an edgeless canvas       |
| [CryptPad](https://github.com/cryptpad/cryptpad) | End-to-end encrypted office suite that includes a simple Whiteboard app | AGPL-3.0                            | End-to-end encryption matters more than diagramming tools |
| [WBO](https://github.com/lovasoa/whitebophir)    | Lightweight real-time whiteboard that saves boards as SVG on the server | AGPL-3.0                            | Minimal shared whiteboard without accounts                |

None of these open or save `.excalidraw` files natively, so migrating existing diagrams requires redrawing or exporting static images.

## Deploy ExcaliDash

```bash
git clone https://github.com/ZimengXiong/ExcaliDash.git
cd ExcaliDash
docker compose -f docker-compose.prod.yml up -d
```

Open `http://localhost:6767` to create the administrator account, then continue with:

- [How to self-host Excalidraw with Docker Compose](/guides/self-host-excalidraw)
- [Excalidraw OIDC & SSO setup](/guides/excalidraw-oidc-sso)
- [Reverse proxy, HTTPS & WebSockets](/guides/excalidraw-reverse-proxy)
- [PostgreSQL & S3 storage](/guides/excalidraw-postgresql-s3)
- [Self-hosted Excalidraw projects compared](/guides/self-hosted-excalidraw-projects)
