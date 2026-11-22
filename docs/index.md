---
title: Self-Hosted Excalidraw with Collaboration & Saved Drawings | ExcaliDash
titleTemplate: false
description: Self-host Excalidraw with persistent drawings, collections, real-time collaboration, version history, and OIDC SSO. Deploy ExcaliDash with Docker Compose.
layout: home
pageClass: canvas-home
markdownStyles: true
footer: true

canvasHero:
  name: "ExcaliDash"
  tagline: Self-hosted Excalidraw dashboard with collections, real-time collaboration, version history, and backups.
  actions:
    - theme: brand
      text: Deploy with Docker
      link: /deploy/docker
    - theme: alt
      text: Quick start
      link: /guide/quick-start

canvasFeatures:
  - title: Organize
    details: Group drawings into collections, search your library, and pick up from any device.
    link: /guide/first-run
  - title: Collaborate
    details: Edit together with live cursors, share drawings or collections, and follow a presenter.
    link: /guide/collaboration
  - title: Version history
    details: Preview earlier snapshots and restore a drawing in two clicks.
    link: /guide/storage-backups
  - title: Authentication
    details: Local accounts, OpenID Connect, or both, plus scoped API keys.
    link: /guide/authentication
  - title: Portable backups
    details: Export your full library with history, or import .excalidraw files.
    link: /guide/storage-backups
  - title: Self-hosted
    details: Docker Compose with SQLite out of the box, or PostgreSQL and S3.
    link: /deploy/docker

canvasImages:
  - label: All Drawings
    light: /images/workspace-light.png
    dark: /images/workspace.png
    alt: ExcaliDash dashboard showing drawing previews, collections, search, and sorting controls
  - label: Collaboration
    light: /images/collaboration-light.png
    dark: /images/collaboration-dark.png
    alt: Four collaborators editing a deployment diagram together with live cursors and presence avatars
---

## Self-host Excalidraw on your own server

ExcaliDash wraps the Excalidraw editor in a full-stack workspace you host with Docker Compose. Unlike the standalone `excalidraw/excalidraw` container—which stores scenes only in browser `localStorage` and points live collaboration to public servers—ExcaliDash saves drawings to your own SQLite or PostgreSQL database and runs real-time collaboration on your own backend. It is an independent open-source (LGPL-3.0) project, not affiliated with Excalidraw.

- **Complete self-hosting walkthrough:** [How to self-host Excalidraw with Docker Compose and collaboration](/guides/self-host-excalidraw)
- **Comparing options:** [Self-hosted Excalidraw+ alternative](/guides/excalidraw-plus-alternative)
- **Team SSO:** [Self-hosted Excalidraw with OIDC / SSO (Authentik, Keycloak, Pocket ID)](/guides/excalidraw-oidc-sso)
- **Production deployment:** [Deploy with Docker Compose, HTTPS, and backups](/deploy/docker)

## Common questions

### What does ExcaliDash add to the official Excalidraw Docker image?

The official `excalidraw/excalidraw` container is a static frontend without server-side persistence, user accounts, or a self-hosted collaboration backend. ExcaliDash adds a dashboard, persistent SQLite or PostgreSQL storage, collections, search, self-hosted real-time collaboration, version history, user accounts with OIDC SSO, and backups.

### Does ExcaliDash real-time collaboration stay on my own server?

Yes. ExcaliDash runs its own Socket.IO collaboration backend inside the Docker Compose stack, so edits, live cursors, presence avatars, and follow mode stay on your server without needing a separate `excalidraw-room` container. See [Collaboration](/guide/collaboration).

### Is ExcaliDash a self-hosted alternative to Excalidraw+?

Yes. If you want saved drawings, collections, team sharing, live collaboration, version history, and SSO on your own server, see the [Excalidraw+ self-hosted alternative comparison](/guides/excalidraw-plus-alternative).

### Can I import and export standard `.excalidraw` files?

Yes. Import existing `.excalidraw` files into your library, export drawings back to `.excalidraw` anytime, or export full `.excalidash` archives with version history and uploaded images. See [Storage and backups](/guide/storage-backups).
