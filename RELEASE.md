# excalidash v0.6.0-dev

## new features

- introduced a built-in canvas assistant with persistent chat history, tool activity, thinking details, model selection, undo support, and live canvas updates
- added support for openai, anthropic, google gemini, opencode go, custom openai-compatible providers, and per-user chatgpt subscriptions
- added live provider model discovery, connection testing, credential-aware caching, manual model fallbacks, and multiple named provider profiles
- introduced a drawing agent api with structural summaries, element inspection, atomic semantic operations, batch references, automatic layout, and live editor synchronization
- added drawing-scoped agent tokens with one-time secret display, 30-day expiration, revocation controls, and isolation from unrelated drawings and account routes
- introduced tldraw as an optional second canvas engine while keeping excalidraw as the default
- added per-drawing engine selection, engine badges, a default engine preference, engine-aware history, and protection against incompatible cross-engine operations
- added split-screen version history so older snapshots can be previewed and compared before restoring
- added server-backed user preferences for theme, grid size, editor behavior, and default canvas engine
- added the ability to hide shared drawings from the dashboard without removing access
- added configurable expiration controls for view and edit links, including safer defaults and maximum lifetimes
- added a disabled authentication mode for trusted single-user deployments with no login or onboarding flow
- added scheduled database backups with configurable retention and persistent backup volume support
- added an administrator switch that hides and blocks all ai features without deleting providers, connections, or tokens

## storage and reliability

- introduced per-file image storage so scene saves contain metadata instead of repeatedly embedding full image payloads
- added database-backed image blobs by default and optional s3-compatible storage for aws, minio, cloudflare r2, and similar services
- existing database images move to s3 lazily when their drawing is next saved, avoiding a mandatory backfill or downtime
- added parallel and cacheable image loading, idempotent uploads, storage validation, and a startup storage health report
- images are no longer truncated when long data urls pass through sanitization
- images are no longer lost when collaborative updates merge file maps from multiple clients
- uploaded images are saved immediately instead of waiting for another canvas edit
- pending image data no longer leaks into scene saves while uploads are still being processed
- image references now survive reloads, imports, history restores, collaboration updates, and cache rehydration
- saves now flush when leaving the editor, reducing lost edits during navigation, refreshes, and container shutdown
- scene version conflicts now produce controlled retries instead of silently overwriting newer data
- scheduled backups now retain the s3 asset metadata needed to restore image-backed drawings

## editor and dashboard

- improved dashboard loading, pagination, sorting, selection, drag and drop, sharing controls, menus, badges, and empty states
- improved the editor header, dialogs, upload status, automatic hiding, collaboration scheduling, and leave-page save feedback
- improved sharing screens with clearer access levels, expiration controls, agent access, token status, and passphrase behavior
- improved settings and administration screens with consistent controls, clearer provider setup, safer confirmations, and better error messages
- improved ai canvas operations with stronger element normalization, binding repair, frame titles, batch layout, and more reliable multi-step tool execution
- canvas agents now apply completed operations before stopping when a provider reaches its output limit
- shared drawing access now stays consistent across api requests, sockets, editor redirects, and permission changes

## authentication and security

- hardened oidc login, callback validation, logout behavior, issuer handling, email verification, and split-horizon discovery
- chatgpt oauth states are now bounded, short-lived, single-use, and tied to the connecting user
- provider secrets and chatgpt refresh tokens are encrypted before database storage and never returned to the browser
- agent tokens are restricted to their drawing and rejected by every unrelated route
- hardened api key scopes, sharing policies, csrf handling, origin checks, socket authorization, and impersonation boundaries
- added configurable request limits for login, csrf, uploads, body size, agent operations, snapshots, sharing, and cache behavior
- fixed rate limiting for ipv6 clients so equivalent addresses cannot bypass request limits through alternate formatting

## imports and compatibility

- standardized backup import and export around the `.excalidash` archive format
- fixed archive fidelity for drawings, collections, files, engines, sharing metadata, and stored preferences
- removed legacy `.excalidraw`, json, zip, sqlite, and raw database import paths
- existing excalidraw drawings remain excalidraw drawings and require no conversion
- canvas engines cannot be changed after drawing creation because excalidraw and tldraw use incompatible scene models
- agent api and canvas assistant operations currently target excalidraw drawings only

## deployment and developer experience

- added matching sqlite and postgresql migrations for drawing files, canvas engines, provider profiles, chat history, agent tokens, sharing policy, and system settings
- added typed environment configuration, generated configuration references, startup validation, and checks that keep direct environment access out of application code
- improved docker shutdown behavior with proper signal forwarding and graceful socket and database cleanup

<!-- native architecture build retry -->
