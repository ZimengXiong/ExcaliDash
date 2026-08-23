# ExcaliDash 0.6.1-dev

Release date: August 23, 2026

This prerelease combines the stable `0.6.0` foundation with the redesigned interface, canvas assistant, and drawing agent API. It is intended for release-candidate testing before `0.6.1`.

## Highlights

- Added a built-in canvas assistant with OpenAI, Anthropic, Gemini, OpenCode, custom OpenAI-compatible providers, and optional per-user ChatGPT connections.
- Added drawing-scoped agent tokens and semantic APIs for structural reads, atomic edits, live editor synchronization, and bounded automatic graph layout.
- Restored the polished dashboard, editor chrome, settings, profile, administration, sharing, authentication, and password-reset interfaces.
- Restored legacy Excalidraw, JSON, ZIP, and SQLite import controls that were lost during the interface redesign.
- Kept Excalidraw as the only canvas engine. This prerelease doesn't include tldraw.

## Reliability and storage

- Load drawing previews only when cards approach the viewport, with bounded pagination and lightweight list responses.
- Compress version-history snapshots with backward-compatible Brotli encoding and bounded decompression.
- Reclaim deleted SQLite snapshot pages through measured, single-flight maintenance.
- Prevent image compression from causing repeated file-delta, socket, and save loops.
- Accept valid backup drawings larger than the former 5 MiB extracted-data limit, within configured upload and archive limits.
- Improve interactive version previews, canvas fitting, restore behavior, and protection against stale asynchronous responses.

## Authentication and security

- Add SMTP and Resend delivery for password-reset email.
- Keep reset tokens out of request URLs by using URL fragments and removing them from browser history immediately.
- Return password-reset requests before mail delivery so response timing doesn't disclose whether an account exists.
- Add keyboard-accessible password reveal controls and live confirmation feedback.
- Support `OIDC_CLIENT_SECRET_FILE` with conflict, readability, and empty-secret validation.
- Prefer the strongest direct or inherited sharing permission and allow owners to move drawings into collections where they have edit access.
- Restrict embedded web content to credential-free public HTTPS destinations and block local or private-network targets.
- Keep the exact health endpoint available over container-local HTTP when public HTTPS redirects are enabled.

## Deployment

- Run backend and frontend containers without root by default.
- Bundle SQLite and PostgreSQL Prisma clients in the backend image so startup doesn't download generated clients.
- Keep provider-specific migrations and rootless startup behavior for both supported databases.
- Continue publishing multi-architecture images for `linux/amd64` and `linux/arm64`.

## Validation

- Backend: 508 tests passed across 75 files.
- Frontend: 198 tests passed across 47 files.
- Playwright: 63 standard scenarios, 4 authenticated agent scenarios, and the UI-capture scenario passed headlessly.
- Backend and frontend production builds passed.
- Frontend lint completed with no errors.

## Upgrade

Back up the backend volume before upgrading. Pull the prerelease images and let the normal startup migrations run:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs backend --tail=200
```

For a reproducible deployment, pin both images to the immutable tag shown on this release instead of the rolling `dev` tag.
