---
title: Self-Hosted Excalidraw+ Alternative (Open Source)
description: Compare ExcaliDash vs Excalidraw+ and the official Excalidraw Docker image. Self-host saved drawings, collections, live collaboration, version history, and OIDC SSO with Docker Compose.
---

# Self-hosted Excalidraw+ alternative

If you like the Excalidraw canvas and want **Excalidraw+**-style workspace features—persistent cloud-like storage, folders/collections, team collaboration, access controls, and version history—running on your own server, **ExcaliDash** is an open-source (LGPL-3.0) self-hosted workspace built around the Excalidraw editor.

ExcaliDash is an independent project and is not affiliated with Excalidraw.

## Feature comparison

| Feature                          | Official `excalidraw/excalidraw`          | Excalidraw+ (Hosted)   | ExcaliDash (Self-Hosted)                               |
| -------------------------------- | ----------------------------------------- | ---------------------- | ------------------------------------------------------ |
| Hosting                          | Self-hosted static frontend               | Managed cloud          | Self-hosted Docker Compose                             |
| Saved drawings across devices    | No (browser storage only)                 | Yes                    | Yes (SQLite or PostgreSQL)                             |
| Collections / folders & search   | No                                        | Yes                    | Yes                                                    |
| Real-time collaboration          | Public server or manual `excalidraw-room` | Yes                    | Yes (built-in Socket.IO + follow mode)                 |
| Drawing & collection permissions | No                                        | Yes                    | Yes (account-level + expiring share links)             |
| Version history & restore        | No                                        | Yes                    | Yes (automatic snapshots)                              |
| Authentication & SSO             | No                                        | Managed accounts / SSO | Local accounts + OIDC (Authentik, Keycloak, Pocket ID) |
| Image storage                    | Embedded in local file                    | Managed cloud          | Local volume or S3 / MinIO / R2                        |
| Import / export `.excalidraw`    | Yes                                       | Yes                    | Yes + full `.excalidash` workspace archives            |
| License / pricing                | MIT (free)                                | Paid subscription      | GNU LGPL v3.0 (free, self-hosted)                      |

## What you get out of the box

### Organized dashboard instead of loose files

All drawings are stored in your own database and shown with light/dark previews in a searchable dashboard. Group related diagrams into collections, sort by recency or title, and pick up any drawing from another machine.

<ThemeScreenshot light="/images/workspace-light.png" dark="/images/workspace.png" alt="ExcaliDash self-hosted Excalidraw dashboard with drawing previews and collections" />

### Built-in multiplayer collaboration

Share individual drawings or entire collections with teammates (view or edit access), or create optional expiring links. Active collaborators see live named cursors, presence avatars, and can click any avatar to follow that presenter's viewport.

<ThemeScreenshot light="/images/collaboration-light.png" dark="/images/collaboration-dark.png" alt="Real-time Excalidraw collaboration with live cursors and presence avatars in ExcaliDash" />

### Version history and portable backups

ExcaliDash records snapshots automatically as you edit so you can preview earlier states and restore them in two clicks. Your data stays portable: import or export standard `.excalidraw` files anytime, or export a `.excalidash` archive containing drawings, collections, snapshots, and uploaded images.

## Deploy in two minutes

```bash
git clone https://github.com/ZimengXiong/ExcaliDash.git
cd ExcaliDash
docker compose -f docker-compose.prod.yml up -d
```

Open `http://localhost:6767` to create your administrator account.

- [Full self-hosting walkthrough with reverse proxy configs](/guides/self-host-excalidraw)
- [Configure OIDC / SSO for your team](/guides/excalidraw-oidc-sso)
- [Production Docker Compose guide](/deploy/docker)
