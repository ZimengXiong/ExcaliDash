# AI Provider Setup and Discovery

For a known provider, the normal setup is provider + API key + **Test
connection** + model. Canonical base URLs, protocols, defaults, and discovery
behavior come from `backend/src/ai/providerDefinitions.ts`; the frontend does
not maintain a second defaults table. Base URL overrides, comma-separated
manual model IDs, and reasoning overrides are under **Advanced**. Tests and
discovery run on the backend, including for unsaved form values, so the browser
never contacts a provider directly and stored secrets are never returned.

## Provider matrix

| Provider | Runtime protocol | Live catalog / authentication | What Test connection proves |
| --- | --- | --- | --- |
| OpenAI | OpenAI Chat Completions | `GET /v1/models`, bearer API key | Key authentication, catalog access, selected ID present. The catalog does not guarantee Chat Completions/tool compatibility. |
| Anthropic | Anthropic Messages | `GET /v1/models`, `x-api-key` + `anthropic-version` | Key authentication, account-visible catalog, selected ID present. |
| Google Gemini | OpenAI-compatible chat; native catalog | `GET /v1beta/models`, `x-goog-api-key`; filtered to `generateContent` | Key authentication and a generation-capable selected model. |
| OpenCode Go | Mixed: OpenAI `/chat/completions` or Anthropic `/messages`, selected per model | `GET https://opencode.ai/zen/go/v1/models` | Endpoint and selected model availability. The catalog is public, so the key itself is not verified until a chat request; the UI discloses this. |
| Custom OpenAI-compatible | OpenAI Chat Completions | Conventional `GET {baseUrl}/models`, bearer key | Whatever the custom server's optional catalog proves. A missing/invalid catalog falls back to manual configuration. |
| ChatGPT subscription | Codex Responses with per-user OAuth | Authenticated Codex model catalog, cached per account | Admin setup only confirms subscription support; each user connects/tests their own account in the canvas. |

## Cache and fallback behavior

Discovery results are cached in memory for ten minutes per provider, base URL,
and one-way credential fingerprint. **Refresh models** bypasses that cache.
ChatGPT's per-account catalog has its own five-minute cache. On timeout, rate
limit, malformed data, unsupported discovery, or a temporarily lagging catalog,
ExcaliDash keeps the configured model and adds a small versioned fallback
registry. It never silently deletes a saved model.

OpenAI results exclude obvious embedding, image, audio, moderation,
transcription, and realtime IDs. Gemini requires `generateContent`. Manual IDs
remain available because vendor catalog metadata is not complete enough to
prove canvas tool compatibility.

The design follows the stale-on-error/explicit-refresh patterns used by
[OpenCode](https://github.com/anomalyco/opencode/blob/dev/packages/core/src/models-dev.ts)
and [OpenAI Codex](https://github.com/openai/codex/blob/main/codex-rs/models-manager/src/manager.rs).
[Pi](https://github.com/badlogic/pi-mono/blob/main/packages/ai/scripts/generate-models.ts)
instead generates a checked-in, reviewed catalog from upstream data and applies
provider corrections. ExcaliDash deliberately does not depend on
[models.dev](https://github.com/anomalyco/models.dev) at runtime: its
MIT-licensed catalog is useful reference data, but live account catalogs plus a
small reviewed fallback avoid a new availability dependency and
adapter-metadata drift.

## OpenCode Go

OpenCode Go is the specific [OpenCode Go subscription
product](https://dev.opencode.ai/docs/go/), not a generic relabelled
OpenAI-compatible profile. Its canonical base URL is
`https://opencode.ai/zen/go/v1`; API calls use the bare model ID returned by
`/models` (the `opencode-go/<id>` form is only OpenCode's config notation).
OpenAI-compatible models authenticate with bearer auth, while Anthropic-format
models use `x-api-key`; ExcaliDash routes each reviewed model accordingly.

The service currently documents spend-window limits of $12 per five hours, $30
per week, and $60 per month, subject to change. Availability can also lag the
published list when an upstream host is degraded. ExcaliDash intersects the
live IDs with its reviewed protocol map because the public `/models` response
does not include protocol metadata. Newly added IDs require a small registry
update before they appear in the normal picker, avoiding unsafe protocol guesses.
