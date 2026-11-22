---
title: Self-Host Excalidraw Quick Start
description: Launch a self-hosted Excalidraw workspace with ExcaliDash and Docker Compose in under two minutes.
---

<script setup>
import { setupSlides } from "../.vitepress/theme/screenshot-flows";
</script>

# Quick start

Launch ExcaliDash locally with Docker Compose in under two minutes.

## Requirements

- Docker Engine or Docker Desktop
- Docker Compose v2
- Host port `6767` free

## Start the stack

1. Clone the repository:

   ```bash
   git clone https://github.com/ZimengXiong/ExcaliDash.git
   cd ExcaliDash
   ```

2. Start the frontend and backend containers:

   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

3. Open `http://localhost:6767`.
4. [Create your administrator account](/guide/first-run#create-the-administrator).

## First-run walkthrough

Step through the initial setup below, from enabling authentication to opening your first blank canvas.

<ScreenshotCarousel label="First-run setup from authentication to your first drawing" :slides="setupSlides" />

## Inspect running services

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f
```

## Stop the stack

```bash
docker compose -f docker-compose.prod.yml down
```

Your drawings remain in the `backend-data` Docker volume. To put ExcaliDash behind HTTPS with scheduled backups on a server, continue to [Deploy with Docker Compose](/deploy/docker).
