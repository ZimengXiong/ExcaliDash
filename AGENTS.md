# AGENTS.md

This file helps two kinds of agents work on ExcaliDash.

## Project summary (what is ExcaliDash?)

ExcaliDash is a self-hosted dashboard and organizer for Excalidraw drawings, with persistent storage and live collaboration.
Core user-facing features include organizing drawings into collections, search, export/import for backup, and configurable authentication (local and optional OIDC).

## Helpers (Operations)

- Official supported deployment flow (production): `docker-compose.prod.yml`
  - `curl -OL https://raw.githubusercontent.com/ZimengXiong/ExcaliDash/main/docker-compose.prod.yml`
  - `docker compose -f docker-compose.prod.yml pull`
  - `docker compose -f docker-compose.prod.yml up -d`
- Production hardening quick checklist:
  - Pin images to a specific release tag (or digest) instead of `:latest` for reproducible upgrades/rollbacks.
  - Stable tags are published as `zimengxiong/excalidash-backend:<VERSION>` and `zimengxiong/excalidash-frontend:<VERSION>` (and also `:latest`).
  - Pre-release tags are published as `:dev` and `:<VERSION>-dev` (and do not update `:latest`).
  - Set fixed `JWT_SECRET` and `CSRF_SECRET` for portability and multi-instance/redeploy scenarios.
  - Set `FRONTEND_URL` to your public URL(s) and keep `TRUST_PROXY=false` unless you are behind a trusted proxy hop.
  - Ensure the backend volume is backed up (SQLite DB + persisted secrets).
- Re-check production health:
  - `docker compose -f docker-compose.prod.yml ps`
  - `docker compose -f docker-compose.prod.yml logs backend --tail=200`
  - `docker compose -f docker-compose.prod.yml logs -f backend`
- Upgrade production:
  - `docker compose -f docker-compose.prod.yml down` (if needed)
  - `docker compose -f docker-compose.prod.yml pull`
  - `docker compose -f docker-compose.prod.yml up -d`
- Check bootstrap/setup signal if onboarding blocks access:
  - `docker compose -f docker-compose.prod.yml logs backend --tail=200 | grep "BOOTSTRAP SETUP"`
- For local helper debugging with compose (repo checkout): `docker compose up -d` (uses `docker-compose.yml`; use `-f docker-compose.prod.yml` if you deployed from Docker Hub images)
- Must-read first for common user issues: `README.md`

### Pinning And Switching Docker Tags

Pin to a stable release (recommended for production):

```yaml
services:
  backend:
    image: zimengxiong/excalidash-backend:0.4.18
  frontend:
    image: zimengxiong/excalidash-frontend:0.4.18
```

Switch to pre-release images (rolling `:dev` tag):

```yaml
services:
  backend:
    image: zimengxiong/excalidash-backend:dev
  frontend:
    image: zimengxiong/excalidash-frontend:dev
```

Switch to a specific pre-release build (pinned `:<VERSION>-dev` tag):

```yaml
services:
  backend:
    image: zimengxiong/excalidash-backend:0.4.18-dev
  frontend:
    image: zimengxiong/excalidash-frontend:0.4.18-dev
```

Switch to a one-off custom dev tag (published by `make dev-release NAME=...`):

```yaml
services:
  backend:
    image: zimengxiong/excalidash-backend:0.4.18-dev-issue38
  frontend:
    image: zimengxiong/excalidash-frontend:0.4.18-dev-issue38
```

## Contributors (Code Changes)

- Architecture map: backend (`backend/src`), frontend (`frontend/src`)
- Config source of truth: `backend/src/config.ts` (env + validation)
- Entry server init: `backend/src/index.ts`
- API client: `frontend/src/api/index.ts`
- Realtime/editor behavior: `frontend/src/pages/Editor.tsx`
- Deployment flow: `docker-compose*.yml`, `backend/Dockerfile`, `frontend/Dockerfile`, entrypoint scripts
- Build/dev commands: `make build`, `npm test`, `make test-all`, `make test-e2e`
- Development contributor flow:
  - `make install` → `make dev`
  - stop with `make dev-stop`
  - `make dev-backend` / `make dev-frontend` if you only need one side

## Helper workflow

Prioritize operational steps, then point to the exact commands or files.

For setup and troubleshooting, start here.

- Goal check: confirm whether the user needs local dev, Docker Compose from Docker Hub images, locally built Docker, or E2E.
- Check whether the problem is already known:
  - If the agent has GitHub access, search issues for the exact error text/symptom and link the closest match.
  - If the agent cannot browse, ask the user to search and share the issue link (or paste issue text).
  - Note: `git` does not provide a native way to browse GitHub Issues. Use the web UI or GitHub CLI (`gh`).
  - Issue tracker: `https://github.com/ZimengXiong/ExcaliDash/issues`
  - Search tip: `https://github.com/ZimengXiong/ExcaliDash/issues?q=is%3Aissue+<paste+error+snippet>`
  - If `gh` is available:
    - Set repo: `gh repo set-default ZimengXiong/ExcaliDash`
    - Search/list: `gh issue list --search "<error snippet>"`
    - View: `gh issue view <number> -w`
    - Create (guided): `gh issue create`
    - If missing, prompt the user to install `gh` (recommended) or use the web UI.
- Use the `README.md` and `e2e/README.md` as the primary operator references.
- If the question is about one error, find the nearest environment or script path before proposing code changes.
- Encourage filing an issue when needed (new bug / unclear docs / missing troubleshooting):
  - Ask the user to include:
    - Their deployment mode: Docker Hub compose (`docker-compose.prod.yml`) vs repo compose (`docker-compose.yml`) vs `make` vs direct `npm`
    - App version tag(s) and image tags (or `VERSION` if built from source)
    - OS/arch (for example `linux/arm64`) and whether a reverse proxy is used
    - Sanitized relevant env vars: `AUTH_MODE`, `TRUST_PROXY`, `FRONTEND_URL` (do not share secrets)
    - Logs: `docker compose ... logs backend --tail=200` and the exact error text
    - Repro steps and expected vs actual behavior
  - If the agent can reproduce or pinpoint the root cause, summarize findings and link relevant files/lines.
- If startup is blocked, collect these values from the user first:
  - Are they using Docker Hub compose (`docker-compose.prod.yml`), repo compose (`docker-compose.yml`), `make`, or direct `npm`?
  - If using Docker Hub compose: `docker compose -f docker-compose.prod.yml ps` and `docker compose -f docker-compose.prod.yml logs backend --tail=200`
  - If using repo compose: `docker compose ps` and `docker compose logs backend --tail=200`
  - If using a git clone: `git status`
  - Which auth mode is configured (`AUTH_MODE`)?

## Contributor workflow

Understand runtime first, then touch code with local tests if requested.

- Confirm behavior in three layers before editing:
  - docs (`README.md`, this file)
  - runtime wiring (`docker-*.yml`, `Dockerfile`, entrypoints)
  - source (`backend/src`, `frontend/src`)
- Preserve patterns used in the repo:
  - backend TypeScript server in `backend/src`
  - frontend React/Vite app in `frontend/src`
- Prefer minimal edits and keep env-sensitive behavior documented before/after changes.
- Do not change migration/secret handling unless explicitly requested.

## Repository map (high signal)

- `backend/`: Express API, Prisma schema, auth, sockets, scripts, Docker runtime.
- `frontend/`: React UI, API client wiring, Vite config/build pipeline.
- `e2e/`: Playwright tests and compose-based test runner.
- `docker-compose.yml`: local compose setup for source builds.
- `docker-compose.prod.yml`: production-style compose using published images.
- `Makefile`: repo-wide orchestration commands.
- `README.md`: user-facing installation and operational docs.
- `VERSION`: version string used in builds.
  - Local OIDC helper: `docker-compose.oidc.yml` + `oidc/keycloak/realm-excalidash.json` (Keycloak container + realm seed; no users/passwords committed)

## Quick setup: local development

Dependencies:

- Node.js 20+
- npm
- SQLite-supported environment (default)
- Docker + Docker Compose if using compose path

Install:

- `npm i` in each package: `make install` (or `cd backend && npm install`, `cd frontend && npm install`, `cd e2e && npm install`)

Start backend + frontend in tmux:

- `make dev` (starts `backend` and `frontend` in a split tmux session; requires `tmux`)
- `make dev-stop` to stop
- Backend dev env:
  - `cd backend`
  - `cp .env.example .env`
  - `npx prisma generate`
  - `npx prisma db push`
  - `npm run dev`
- Frontend dev env:
  - `cd frontend`
  - `cp .env.example .env`
  - `npm install`
  - `npm run dev`

Docker quickstart:

- `docker compose -f docker-compose.prod.yml up -d` (official production path, pulls and runs image-based containers)
- `docker compose -f docker-compose.prod.yml pull` and `up -d` for image-based deploy
- Optional local-compose quickstart for source testing: `docker compose up -d` (uses `docker-compose.yml`)
- App default host ports:
  - Compose production/frontend: `http://localhost:6767`
  - Backend internal port: `8000`

E2E quickstart:

- `cd e2e && npm install`
- `npx playwright install chromium`
- `npm test`
- If using existing services: `NO_SERVER=true npm test`
- Dockerized: `npm run docker:test`

## Environment variables

Backend runtime reads `.env` via `backend/.env` and `backend/src/config.ts`.
Frontend runtime uses Vite `import.meta.env` values from `frontend/.env` and build-time defines.

Source of truth:

- Backend: `backend/src/config.ts` and `backend/.env.example`
- Frontend: `frontend/.env.example` and `frontend/vite.config.ts`

Backend base variables:

- `PORT` (default `8000`)
- `NODE_ENV` (`development` / `production`)
- `DATABASE_URL` (`file:...` default via `backend/.env` and resolver)
- `FRONTEND_URL` (comma-separated allowed origins)
- `TRUST_PROXY` (`true`, `false`, or positive hop count)
- `AUTH_MODE` (`local`, `hybrid`, `oidc_enforced`)
- `JWT_SECRET` (required when running backend with `NODE_ENV=production`; Docker entrypoint can auto-generate + persist for single-instance setups)
- `CSRF_SECRET` (recommended for stable CSRF across restarts; Docker entrypoint can auto-generate + persist for single-instance setups)
- `JWT_ACCESS_EXPIRES_IN` (default `15m`)
- `JWT_REFRESH_EXPIRES_IN` (default `7d`)
- `RATE_LIMIT_MAX_REQUESTS` (default `1000`)
- `CSRF_MAX_REQUESTS` (default `60`)
- `ENABLE_PASSWORD_RESET` (`true` to enable)
- `ENABLE_REFRESH_TOKEN_ROTATION` (`true`/`false`, default `true`)
- `ENABLE_AUDIT_LOGGING` (`true`/`false`, default `false`)
- `ENFORCE_HTTPS_REDIRECT` (`true`/`false`, default `true`) — when `FRONTEND_URL` uses `https://`, the backend auto-redirects plain-HTTP requests; set to `false` when the outer gateway already enforces HTTPS to avoid redirect loops
- `BOOTSTRAP_SETUP_CODE_TTL_MS` (default `900000`)
- `BOOTSTRAP_SETUP_CODE_MAX_ATTEMPTS` (default `10`)
- `UPDATE_CHECK_OUTBOUND` (`true`/`false`/`1`/`yes`, default `true`)
- `UPDATE_CHECK_GITHUB_TOKEN` (optional token for GitHub API)
- `GITHUB_TOKEN` (fallback token if update token missing)
- `DRAWINGS_CACHE_TTL_MS` (ms, default `5000`)
- `DEBUG_CSRF` (`true` enables debug logs)
- `DISABLE_ONBOARDING_GATE` (`true` bypasses onboarding gate; not recommended)
- `OIDC_PROVIDER_NAME` (default `OIDC`, optional unless OIDC mode enabled)
- `OIDC_ISSUER_URL` (required in `hybrid`/`oidc_enforced`)
- `OIDC_CLIENT_ID` (required in OIDC modes)
- `OIDC_CLIENT_SECRET` (optional; required for confidential clients, omitted for public clients)
- `OIDC_REDIRECT_URI` (required and HTTPS in production in OIDC modes)
- `OIDC_SCOPES` (default `openid profile email`)
- `OIDC_EMAIL_CLAIM` (default `email`)
- `OIDC_EMAIL_VERIFIED_CLAIM` (default `email_verified`)
- `OIDC_REQUIRE_EMAIL_VERIFIED` (default `true`)
- `OIDC_JIT_PROVISIONING` (default `true`)
- `OIDC_FIRST_USER_ADMIN` (default `true`)

Backend Docker/env control variables:

- `RUN_MIGRATIONS` (`true`/`1` default true in entrypoint)
- `MIGRATION_LOCK_TIMEOUT_SECONDS` (default `120`)
- `JWT_SECRET` and `CSRF_SECRET` persistence support (`.jwt_secret`, `.csrf_secret` in volume)

Frontend variables:

- `VITE_API_URL` (default `/api`)
- `VITE_APP_VERSION` (from build-time metadata)
- `VITE_APP_BUILD_LABEL` (build metadata label)
- `BACKEND_URL` (frontend container entrypoint only; default `backend:8000`, injected into nginx template)

E2E variables:

- `BASE_URL` (default `http://localhost:5173`)
- `API_URL` (default `http://localhost:8000`)
- `HEADED` (`true` to show browser)
- `NO_SERVER` (`true` to skip starting servers)
- `CI` (ci-mode behavior in Playwright config)

## Feature flags and operational switches

- `ENABLE_PASSWORD_RESET`: enable/disable password reset flow.
- `ENABLE_REFRESH_TOKEN_ROTATION`: control refresh-token rotation behavior.
- `ENABLE_AUDIT_LOGGING`: enable/disable audit event logging.
- `ENFORCE_HTTPS_REDIRECT`: disable built-in HTTP→HTTPS redirect when outer gateway handles it (set to `false`; default `true`).
- `UPDATE_CHECK_OUTBOUND`: disable outbound version check traffic.
- `DISABLE_ONBOARDING_GATE`: bypass first-run onboarding guard (not recommended in production).
- `RUN_MIGRATIONS`: run migrations in backend container startup (`true` default).
- `MIGRATION_LOCK_TIMEOUT_SECONDS`: wait window for startup migration lock.
- `DRAWINGS_CACHE_TTL_MS`: cache duration for list endpoint responses.
- `DEBUG_CSRF`: log CSRF debug output for troubleshooting.
- `BOOTSTRAP_SETUP_CODE_TTL_MS`: bootstrap setup code expiry.
- `BOOTSTRAP_SETUP_CODE_MAX_ATTEMPTS`: max bootstrap attempts before code refresh.

## Reverse proxy / Kubernetes notes

- `FRONTEND_URL` is the origin allow-list for frontend callbacks and API origin checks.
- `TRUST_PROXY` should be `1` for one trusted proxy hop, or `false` when traffic is direct.
- `BACKEND_URL` is injected into `frontend/nginx.conf.template` to route:
  - `/api/` to backend API
  - `/socket.io/` to backend websocket
- For Kubernetes, set `BACKEND_URL` to service DNS (example `excalidash-backend.default.svc.cluster.local:8000`).
- Ensure TLS termination and `X-Forwarded-Proto` are consistent with proxy headers; auth + sockets depend on this.

## Architecture notes for contributor agents

Backend entrypoint flow:

- `backend/src/config.ts` loads and validates environment variables.
- `backend/src/index.ts` creates express app, socket.io server, middleware, routes, and startup-time guards.
- `backend/src/auth.ts`, `backend/src/auth/*`, and `backend/src/routes/*` contain auth/session/onboarding logic.
- `backend/src/db/prisma.ts` wraps Prisma client and caches in non-production.
- `backend/src/security.ts` and `backend/src/routes/system/update.ts` contain request security and update-check controls.
- Migration handling for runtime is in `backend/docker-entrypoint.sh`.
- Build pipeline for runtime includes Prisma generation and TypeScript compile in `backend/Dockerfile`.

Frontend architecture notes:

- `frontend/src/api/index.ts` holds API client and auth/update endpoints.
- `frontend/src/pages/` contains route-level features.
- `frontend/src/context/` contains auth/theme state.
- `frontend/src/pages/Editor.tsx` wires Socket.IO and live collaboration.
- `frontend/vite.config.ts` sets Vite proxy to backend in local dev and compile-time app metadata.
- Production serving and backend proxy are handled by `frontend/Dockerfile`, `frontend/nginx.conf.template`, `frontend/docker-entrypoint.sh`.

## Makefile command map

- Install: `make install`, `make dev`, `make dev-backend`, `make dev-frontend`
- Build/test/lint: `make build`, `make lint`, `make test`, `make test-all`, `make test-e2e`, `make test-e2e-docker`
- Docker: `make docker-build`, `make docker-run`, `make docker-run-detached`, `make docker-ps`, `make docker-logs`, `make docker-down`
- Admin/ops helpers: backend scripts under `backend/package.json` (`admin:recover`, `dev:simulate-auth-onboarding:*`) and `backend/scripts/*`

## Decision matrix for agent response style

- For helper agents: prefer concise operational steps, likely culprit ordering, and exact command snippets.
- For contributor agents: include file-level references and rationale in your diff note (why file was touched, where config is validated).
- When asked for design or behavior explanations, include:
  - Config source file
  - Route or component entry point
  - Why this logic exists based on existing defaults/constraints

## Safe first actions for unknown issues

- Confirm env file presence and variables
- Check compose/backend logs before code changes
- Reproduce with minimal path:
  - `make dev`
  - open frontend `http://localhost:6767`
- For startup crashes: inspect missing environment validation errors from `backend/src/config.ts` and entrypoint migration/secrets log lines.
