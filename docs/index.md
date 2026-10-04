---
title: Self-hosted Excalidraw with Collaboration | ExcaliDash
titleTemplate: false
description: Self-host Excalidraw with saved drawings, collections, real-time collaboration, and version history. Deploy ExcaliDash with Docker Compose.
layout: home
pageClass: canvas-home
markdownStyles: true
footer: false

canvasHero:
  name: "ExcaliDash"
  headline: Self-hosted Excalidraw, organized.
  tagline: Saved drawings, collections, real-time collaboration, and version history. Run your own workspace with Docker Compose.
  actions:
    - theme: brand
      text: Self-host with Docker
      link: /deploy/docker
    - theme: alt
      text: View on GitHub
      link: https://github.com/ZimengXiong/ExcaliDash

canvasFeatures:
  - icon: "01"
    title: Organize
    details: Group drawings into collections. Search and sort your workspace.
  - icon: "02"
    title: Collaborate
    details: Edit together in real time. Share drawings and collections.
  - icon: "03"
    title: Self-host
    details: Deploy with Docker Compose using SQLite or PostgreSQL.
  - icon: "04"
    title: Restore
    details: Browse drawing history and restore earlier versions.
  - icon: "05"
    title: Sign in
    details: Use local accounts, OpenID Connect, or both.
  - icon: "06"
    title: Portable data
    details: Import, export, and back up your ExcaliDash library.

canvasImage:
  light: /images/collaboration-light.png
  dark: /images/collaboration-dark.png
  alt: Four collaborators reviewing a deployment diagram, with live named cursors and presence avatars
---

## Your drawings, on your server

ExcaliDash is an open-source workspace built around the Excalidraw editor. Keep your drawings in a persistent database, organize them into collections, and work together in real time. It is an independent project, not an official Excalidraw product.

### Self-host Excalidraw with Docker Compose

Run the frontend and backend on your own machine, homelab, or server. The default stack uses SQLite and a persistent Docker volume. Follow the [Excalidraw self-hosting guide](/deploy/docker) for installation, HTTPS, and upgrades.

### Draw together and control access

Invite people to drawings or collections, choose viewing or editing permissions, and collaborate with live cursors. Use local accounts or OpenID Connect for sign-in. Read the [collaboration guide](/guide/collaboration) and [authentication setup](/guide/authentication).

### Save, restore, and back up

Drawings are stored on your server so you can return to them from another device. Browse version history, restore an earlier drawing, and export your library. Learn [how storage and backups work](/guide/storage-backups).

## Questions about self-hosting Excalidraw

### What does ExcaliDash add to Excalidraw?

ExcaliDash embeds the Excalidraw editor and adds a dashboard, persistent drawing storage, collections, sharing permissions, collaboration, version history, and account management.

### Can I collaborate on my own server?

Yes. The ExcaliDash backend handles real-time collaboration. Your reverse proxy must forward WebSocket connections; the [Docker guide](/deploy/docker#configure-https) explains the setup.

### Does restarting Docker erase my drawings?

The default Compose stack stores data in the `backend-data` volume, which survives container restarts and ordinary `docker compose down`. Deleting the volume removes that data. Keep [separate backups](/guide/storage-backups).

### Can I use my existing Excalidraw files?

Yes. ExcaliDash supports import and export of drawings in `.excalidraw` format, as well as library export and import for moving your workspace.
