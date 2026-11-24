---
title: Local Development
description: Run the ExcaliDash backend, frontend, and VitePress documentation site locally with Node.js 24, SQLite, ESLint, and Playwright tests.
---

<script setup>
import { setupSlides } from "../.vitepress/theme/screenshot-flows";
</script>

# Local development

Run the backend and frontend dev servers in separate terminals from a local clone.

## Prerequisites

- Node.js `24.22.1+` (`nvm use` picks up `.nvmrc`)
- npm `10`
- Git

## Install dependencies

From the repository root:

```bash
npm run install:all
npm install
```

## Configure environment files

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Update the placeholder paths in `backend/.env`:

```dotenv
DATABASE_URL=file:./dev.db
BACKUP_DIR=./backups
```

## Start the backend

```bash
cd backend
npm run dev
```

## Start the frontend

In a second terminal:

```bash
cd frontend
npm run dev
```

Open `http://localhost:6767` and walk through the first-run setup below.

<ScreenshotCarousel label="First-run setup after starting the local services" :slides="setupSlides" />

## Useful workspace scripts

Run from the repository root:

| Command            | Purpose                                                      |
| ------------------ | ------------------------------------------------------------ |
| `npm run check`    | Run Prettier, ESLint, version parity, and env boundary check |
| `npm run build`    | Build both backend and frontend bundles                      |
| `npm run test`     | Run backend integration tests and Playwright e2e suites      |
| `npm run docs:dev` | Start this VitePress docs site locally with live reload      |
