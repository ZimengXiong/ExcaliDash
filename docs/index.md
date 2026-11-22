---
title: ExcaliDash — Self-hosted Excalidraw Workspace
titleTemplate: false
description: Self-host Excalidraw with persistent drawings, collections, real-time collaboration, version history, and portable backups using Docker Compose.
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

ExcaliDash wraps the Excalidraw editor in a workspace you host. Drawings are saved to your own database, so you can organize, share, and restore them from any device. It is an independent open-source project, not affiliated with Excalidraw.

## Common questions

### What does ExcaliDash add to Excalidraw?

Saved drawings, collections, search, live collaboration, version history, accounts, and backups.

### Does ExcaliDash collaboration stay on my server?

Yes. Everything runs on your own backend. See [Collaboration](/guide/collaboration).

### Can I bring my `.excalidraw` files?

Yes. Import them into your library and export them back anytime.
