---
title: "Self-host Excalidraw: Quick Start"
description: Install ExcaliDash with Docker Compose, create your administrator account, and start a self-hosted Excalidraw workspace.
---

# Quick start

Run ExcaliDash with Docker Compose.

## Prerequisites

- Docker Engine or Docker Desktop
- Docker Compose v2
- Port `6767` available on the host

## Start ExcaliDash

1. Clone the repository:

   ```bash
   git clone https://github.com/ZimengXiong/ExcaliDash.git
   cd ExcaliDash
   ```

2. Start the services:

   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

3. Open `http://localhost:6767`.
4. [Create the administrator account](/guide/first-run#create-the-administrator).

<ThemeScreenshot light="/images/screenshots/auth-setup-light.png" dark="/images/screenshots/auth-setup.png" alt="Authentication setup shown when opening a fresh instance" />

After creating your account, **All Drawings** is your starting point. The example below shows a workspace populated with sample drawings and collections.

<ThemeScreenshot light="/images/workspace-light.png" dark="/images/workspace.png" alt="All Drawings dashboard with drawings organized into collections" />

## Check the services

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f
```

## Stop the stack

```bash
docker compose -f docker-compose.prod.yml down
```

For a server deployment, see [Deploy with Docker Compose](/deploy/docker).
