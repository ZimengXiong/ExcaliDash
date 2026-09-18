# Contributing to ExcaliDash

## Requirements

- Node.js 20
- npm 10 or newer
- Docker with Docker Compose v2 for container and configuration-lab work

Use the Node version recorded in `.nvmrc`, then install the locked dependencies:

```bash
nvm use
npm ci
npm run install:all
```

## Local development

Run the backend and frontend in separate terminals so each process remains easy to inspect and stop:

```bash
cd backend
cp .env.example .env
npm run dev
```

```bash
cd frontend
cp .env.example .env
npm run dev
```

The frontend defaults to `http://localhost:6767` and proxies API and Socket.IO traffic to `http://localhost:8000`.

## Checks

Run these commands from the repository root before opening a pull request:

```bash
npm run format
npm run check
npm test
npm run build
```

Run browser tests when changing user workflows, persistence, authentication, sharing, or collaboration:

```bash
npm run test:e2e
```

Do not commit `.env` files, databases, generated Prisma clients, build output, uploads, test reports, or credentials. Add new configuration through the registry under `backend/src/config/registry`, regenerate `docs/CONFIGURATION.md`, and include tests for behavior changes.
