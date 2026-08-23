# Open issue and pull request audit

Reviewed on August 23, 2026, against the release-candidate `dev` branch, oldest first. No issue, pull request, review, label, or other public GitHub state was changed.

Status meanings:

- **Fixed on dev**: The branch contains the fix, including fixes added during this review.
- **Already fixed**: The requested behavior was present before this review.
- **Blocked or deferred**: A safe focused change requires an upstream stable release, a sample, product decisions, or a separately scoped design.
- **Needs work or superseded**: Don't merge the pull request as submitted. The notes identify any focused behavior ported to dev.

## Issues

| Issue | Status | Result |
|---|---|---|
| #49 | Already fixed | Persistent Prisma volume and Unraid mapping guidance are present. |
| #59 | Fixed on dev | Drawing previews load near the viewport without repeated sibling requests. |
| #63 | Partly fixed; upstream blocked | Arrow improvements are stable; library search isn't in stable Excalidraw. |
| #66 | Already fixed | OIDC signing-algorithm selection and mismatch recovery are covered. |
| #71 | Already fixed | SQLite and PostgreSQL provider selection and migrations are complete. |
| #76 | Already fixed | Theme and drawing-sort preferences persist per user. |
| #83 | Already fixed | Scheduled SQLite backups and retention are implemented. |
| #84 | Already fixed | Mermaid images persist and rehydrate after reload. |
| #88 | Already fixed | Grid-step selection and persistence are implemented. |
| #93 | Fixed on dev | Owners can move drawings into collections where they have edit access. |
| #98 | Already fixed | Excalidraw runtime assets and fonts are bundled locally. |
| #111 | Already fixed | Stable Excalidraw provides the flowchart shortcuts. |
| #119 | Upstream blocked | Library search requires a future stable Excalidraw release. |
| #121 | Needs feature design | Access groups require schema, OIDC, ACL, admin UI, and test design. |
| #139 | Fixed on dev; docs follow-up | Agent APIs existed; bounded graph layout was added. The README link was preserved for the user's concurrent docs work. |
| #145 | Already fixed | S3-compatible file storage and progressive rehydration are complete. |
| #156 | Already fixed | Collection sharing is implemented across backend and UI. |
| #159 | Already resolved | Configurable email-verification claims cover Microsoft Entra. |
| #160 | Upstream blocked | Stable Excalidraw doesn't expose custom canvas-font registration. |
| #161 | Obsolete | The temporary release pause has ended. |
| #166 | Substantially fixed | Localization and directional flowchart creation exist; the exact context menu doesn't. |
| #171 | Already fixed | Configurable password policy is enforced across all account flows. |
| #176 | Already fixed | Stable Excalidraw supplies flowchart creation and navigation. |
| #177 | Substantially fixed | Per-file uploads remove the reported server limit; an upstream client guard remains. |
| #178 | Already fixed | Non-expiring links persist correctly. |
| #182 | Already fixed | Read-first auth status and SQLite contention settings address P1008. |
| #186 | Already fixed | Socket and room lifecycle cleanup is complete. |
| #195 | Upstream blocked | The dedicated text resize handle isn't in stable Excalidraw. |
| #205 | Already fixed | Import fidelity preserves arrows, fonts, text, and raw files. |
| #206 | Deferred product feature | App-wide localization needs a framework and translation policy. |
| #207 | Already fixed | Users can hide shared drawings. |
| #211 | Already fixed | Disabled-auth single-user mode is implemented. |
| #212 | Mostly fixed; sample needed | Firefox image fixes are present; the exact WebP file wasn't supplied. |
| #213 | Already fixed | Valid image data URLs aren't truncated. |
| #214 | Fixed on dev | SQLite reclaims snapshot pages with measured, single-flight maintenance. |
| #215 | Fixed on dev | Backend and frontend containers run without root. |
| #216 | Fixed on dev | Both Prisma clients are bundled for offline startup. |
| #217 | Needs architecture split | The PWA fork combines several independent product and deployment changes. |
| #237 | Fixed on dev | Embeds allow public HTTPS hosts and reject credentials and local/private destinations. |
| #238 | Upstream blocked | Pressure drawing isn't in stable Excalidraw. |
| #243 | Fixed on dev | Covered by bundled provider-specific Prisma clients. |
| #244 | Fixed on dev | The exact health endpoint bypasses HTTPS redirects. |
| #246 | Fixed on dev | Valid backups larger than 5 MiB restore within configured limits. |
| #251 | Blocked on sample and product choice | Whiteboard ZIP needs a fixture and a view-only versus editable-import decision. |

## Pull requests

| Pull request | Status | Result |
|---|---|---|
| #105 | Needs work; superseded | Don't merge the broad conflicting branch. Narrow health, cache, and redaction behavior already exists. |
| #158 | Superseded | Zoom-to-cursor is integrated; isolated regression tests were added. |
| #185 | Superseded; fixed on dev | Collection sharing exists; strongest inherited access now wins. |
| #189 | Needs work; focused port | Added fail-closed `OIDC_CLIENT_SECRET_FILE` support. |
| #197 | Already integrated | The lockfile already uses Multer 2.2.0. |
| #219 | Already integrated | The lockfile uses newer Axios 1.19.0. |
| #220 | Already integrated | The project already resolves Body Parser 2.3.0. |
| #224 | Superseded | Dev contains the corrected shared-collection move authorization and stronger tests. |
| #226 | Superseded; fixed on dev | Provider cancellation now follows premature response closure. |
| #227 | Needs work; focused port | Added safe, interactive, fitted version previews and async-race coverage. |
| #233 | Needs work | The GHCR workflows have trigger, credential, metadata, and architecture defects. |
| #240 | Ported to dev | Added bounded worker-thread graph layout for REST and AI operations. |
| #247 | Needs split; focused ports | Added snapshot compression; issue #214 supplied a better tested SQLite-maintenance implementation. |
| #248 | Needs work; focused port | Added SMTP and Resend password reset with neutral, fragment-based token delivery. |
| #249 | Needs work; focused port | Added accessible password reveal and live confirmation matching. |
| #250 | Already integrated | Stable CSRF and E2E rate-limit overrides are present. |
| #252 | Fixed on dev | Original image blobs no longer cause repeated compression sync loops. |
| #253 | Superseded | The current image sanitizer is stricter and more complete. |

## Verification

- Backend: 75 files, 508 tests passed; production build passed.
- Frontend: 47 files, 198 tests passed; production build passed; lint has no errors and 13 existing warnings.
- Playwright: 63 standard scenarios passed; 4 agent-auth scenarios and the UI-capture scenario passed separately headlessly.
- Container checks: both database providers, rootless backend startup, arbitrary-UID frontend startup, and offline Prisma selection were exercised during the focused reviews.
