---
title: "Self-host Excalidraw: Quick Start"
description: Install ExcaliDash with Docker Compose, create your administrator account, and start a self-hosted Excalidraw workspace.
---

<script setup>
import { setupSlides } from "../.vitepress/theme/screenshot-flows";
</script>

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

## Set up your administrator account

Use the arrows to follow the complete first-run flow, from choosing authentication to opening your first drawing. Each screenshot follows this page's light or dark theme.

<ScreenshotCarousel label="First-run setup from authentication to your first drawing" :slides="setupSlides" />

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
