---
title: "Self-Hosted Excalidraw Projects on GitHub: ExcaliDash vs Excaliself & More (2026)"
description: "Compare self-hosted Excalidraw projects on GitHub: ExcaliDash vs Excaliself, excalidraw-full, alswl, excalidraw-persist, and AstraDraw by storage and SSO."
---

# Self-hosted Excalidraw projects on GitHub: ExcaliDash vs Excaliself, excalidraw-full, and alswl (2026)

For persistent drawings, user accounts, and live collaboration in Docker without rebuilding the Excalidraw frontend, the two main open-source options on GitHub are ExcaliDash (SQLite or PostgreSQL, OIDC SSO, version history) and Excaliself (PostgreSQL, team workspace, MCP server, Excalidraw+ importer). Pick `excalidraw-persist` for a minimal single-user SQLite setup, `alswl/excalidraw-collaboration` for the stock Excalidraw UI with anonymous rooms, or the official image if you only need a browser-local scratchpad.

## Self-hosted Excalidraw projects compared

| Project                                                                                                                         | Storage                                                                      | Accounts & SSO                                   | Live collaboration                             | Frontend rebuild             | License       | Activity                              |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------- | ---------------------------- | ------------- | ------------------------------------- |
| [Official image](https://github.com/excalidraw/excalidraw) + [`excalidraw-room`](https://github.com/excalidraw/excalidraw-room) | Browser `localStorage`                                                       | None                                             | Yes, via `excalidraw-room` (E2E encrypted)     | Yes, to set the WS URL       | MIT           | App active; room last commit Dec 2023 |
| [Excalidraw+](https://plus.excalidraw.com/)                                                                                     | Hosted cloud                                                                 | Hosted accounts                                  | Yes                                            | Not self-hostable            | Proprietary   | Active                                |
| [ExcaliDash](https://github.com/ZimengXiong/ExcaliDash)                                                                         | SQLite or PostgreSQL, images in DB or S3                                     | Local accounts, OIDC (`hybrid`, `oidc_enforced`) | Built-in Socket.IO, named cursors, follow mode | No                           | LGPL-3.0      | Active, v0.7.0                        |
| [Excaliself](https://github.com/maciekzygmunt/excaliself)                                                                       | PostgreSQL                                                                   | Invite-only accounts, Google, Entra ID, OIDC     | Built in                                       | No                           | MIT           | Active, v0.14.0                       |
| [alswl/excalidraw-collaboration](https://github.com/alswl/excalidraw-collaboration)                                             | Keyv storage backend (Redis, MongoDB, PostgreSQL, MySQL); in-memory if unset | None                                             | Yes, `excalidraw-room-go`                      | No (runtime-config fork)     | MIT           | Active, Aug 2026 release              |
| [excalidraw-full](https://github.com/BetterAndBetterII/excalidraw-full)                                                         | Memory, SQLite, filesystem, or S3                                            | GitHub OAuth, or password via Dex OIDC           | Built into Go backend                          | No (prebuilt patched image)  | None declared | Last commit Aug 2025                  |
| [excalidraw-persist](https://github.com/ozencb/excalidraw-persist)                                                              | SQLite                                                                       | None                                             | No                                             | No                           | MIT (README)  | Last commit Apr 2026                  |
| [Someone0nEarth/excalidraw-self-hosted](https://github.com/Someone0nEarth/excalidraw-self-hosted)                               | MongoDB via alswl storage backend                                            | None                                             | Yes, official `excalidraw-room`                | No (uses `alswl/excalidraw`) | MIT           | Last commit Sep 2025                  |
| [AstraDraw](https://github.com/AstraDraw/astradraw)                                                                             | PostgreSQL + MinIO/S3                                                        | Local accounts, OIDC, workspace roles            | Own Socket.IO room service                     | Custom fork                  | MIT           | Alpha; last commit Dec 2025           |

## Project breakdown

### Official `excalidraw/excalidraw` + `excalidraw-room`

The upstream repository is the reference editor and the only option here with end-to-end encrypted collaboration rooms. Its Docker image is static nginx, so drawings stay in browser storage and the collaboration server URL is compiled into the bundle at build time. Running your own relay means maintaining a custom frontend build. See [self-host Excalidraw collaboration](/guides/excalidraw-collaboration-server).

### Excalidraw+

Excalidraw's hosted commercial product with cloud workspaces and collaboration. Self-hosting is listed on its roadmap backlog and is not offered today. See [self-hosted Excalidraw+ alternative](/guides/excalidraw-plus-alternative).

### ExcaliDash

A self-hosted workspace around the Excalidraw editor with collections, search, SVG previews, per-drawing and per-collection View/Edit sharing, expiring share links, automatic version history, scoped API keys, scheduled SQLite backups, S3 image storage, and `.excalidash` workspace archives. Publishes multi-arch Docker images (`linux/amd64`, `linux/arm64`).

Tradeoffs: single backend instance (`replicas: 1`); no MCP server or Excalidraw+ API importer yet; drawings are stored readable on your server rather than end-to-end encrypted.

### Excaliself

A self-hosted team space with folders, search, trash, and a shared library. Two capabilities set it apart from other projects here: an MCP server at `/api/mcp` that lets AI agents read drawings and propose edits (applied after a user confirms), and a beta Excalidraw+ importer using an API key. Requires PostgreSQL, publishes `amd64` and `arm64` images, and ships templates for Unraid Community Apps, TrueNAS, Coolify, Railway, and Portainer.

### alswl/excalidraw-collaboration

Docker Compose stacks pairing a runtime-configurable Excalidraw fork (`alswl/excalidraw`), a storage backend, and a Go room relay (`excalidraw-room-go`). Keeps the stock `excalidraw.com` UI, anonymous room links, and shareable links on your own server. Make sure `STORAGE_URI` is configured, or shared scenes stay in memory and disappear on restart. No user accounts or dashboard.

### excalidraw-full

A single Go binary paired with a patched frontend, pluggable storage drivers (memory, SQLite, filesystem, S3), GitHub OAuth or Dex OIDC, and an OpenAI proxy. The repo has no declared license file and has seen no commits since August 2025.

### excalidraw-persist

Minimal server-side persistence for a single user: SQLite storage, multiple boards, and a trash view, with no accounts and no live collaboration. Good fit for one person on a trusted LAN or Tailscale network.

### Someone0nEarth/excalidraw-self-hosted

A Traefik Compose stack wiring `alswl/excalidraw`, upstream `excalidraw-room`, alswl's storage backend, MongoDB, and mongo-express. Useful primarily as a Traefik reference for the alswl stack.

### AstraDraw

An Excalidraw fork adding workspaces, roles, comments with mentions, notifications, recorded walkthroughs, and presentation mode. Its README describes it as an alpha project maintained by one developer.

## Which self-hosted Excalidraw project should you pick?

| Need                                                                                      | Best fit                                                                |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Team workspace with OIDC SSO, version history, SQLite or PostgreSQL, and no rebuild       | ExcaliDash                                                              |
| AI agents proposing drawing edits over MCP, Unraid CA template, or Excalidraw+ API import | Excaliself                                                              |
| Stock Excalidraw UI with anonymous E2E-encrypted rooms on your own servers                | Official image + `excalidraw-room`, or `alswl/excalidraw-collaboration` |
| Single user, saved boards, minimal moving parts                                           | `excalidraw-persist`                                                    |
| Zero infrastructure and official support                                                  | Excalidraw+                                                             |
| Browser-local scratchpad with manual `.excalidraw` downloads                              | Official `excalidraw/excalidraw` image                                  |

To start ExcaliDash locally:

```bash
git clone https://github.com/ZimengXiong/ExcaliDash.git
cd ExcaliDash
docker compose -f docker-compose.prod.yml up -d
```

Continue with [How to self-host Excalidraw](/guides/self-host-excalidraw) or [How ExcaliDash works](/guides/how-excalidash-works).
