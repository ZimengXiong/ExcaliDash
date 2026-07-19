# Agent API
The Agent API lets programs (AI agents, scripts, integrations) read and edit a drawing over HTTPS. Edits go through **semantic ops** that are applied
atomically on the server: the whole batch is validated against the authoritative
scene, applied in one transaction, snapshotted for undo, sanitized, and
version-bumped — exactly like a normal save. Open editors receive the changes
live over the existing socket relay.
Administrators can turn off **Enable AI features** under Admin → AI Assistant.
While disabled, the UI hides assistant, provider, ChatGPT connection, and agent
token controls. Every AI and Agent API route returns HTTP `403` with
`code: "AI_FEATURES_DISABLED"`. Existing provider settings, ChatGPT
connections, and tokens are preserved and work again after re-enabling.
- **Read path** — `GET /api/drawings/:id/summary` (compact structural text) and
  `GET /api/drawings/:id/elements/:elementId` (full element JSON).
- **Write path** — `POST /api/drawings/:id/ops` (a batch of 1–50 ops).
- **Base URL** — all paths below are relative to your deployment origin, e.g.
  `https://board.example.com/api/...`. Replace `$BASE`, `$DRAWING`, and `$TOKEN`
  in the examples.
The ops applier owns every low-level detail — element `id`, `seed`,
`versionNonce`, `version` bumps, and binding integrity
(`boundElements`/`containerId`/`startBinding`/`endBinding`). Callers supply only
the semantic parameters in the [op schema](#op-schema-reference).
---
## Authentication
All Agent API requests use a bearer token:
```
Authorization: Bearer exd_...
```
Two kinds of token can reach these routes:
| Token | How to get it | Scope | Reaches |
| --- | --- | --- | --- |
| **Drawing-scoped agent token** | Share dialog → *Agent access* (owner only) | `agent:ops`, confined to one drawing | `summary`, `elements`, `ops` for that drawing only |
| **Account API key** | Account settings → API keys | `drawings:read` and/or `drawings:write`, account-wide | any drawing you can view/edit, plus the rest of the drawings API |
Prefer a **drawing-scoped agent token** for agents: it authenticates as the
drawing owner but is refused by every other route, so a leaked token cannot touch
your other drawings or account. An account API key with `drawings:read` can call
the read path; `drawings:write` is required for `POST /ops`.
Bearer (non-browser) requests are exempt from CSRF. Token management endpoints
(minting/revoking) are session-only and cannot be driven with a bearer token.
### Minting a drawing-scoped agent token (UI)
1. Open the drawing and click **Share**.
2. In the **Agent access** section, click **Create token** (owner only).
3. Copy the token — it is shown **once**. Afterwards only its prefix is listed.
4. Optionally copy the token-free `SKILL.md`, then store the token separately as
   `EXCALIDASH_TOKEN` in the agent's credential store.
5. Drawing-scoped agent tokens expire after 30 days. Revoke them sooner from
   the same panel when they are no longer needed.
Programmatic management (session cookie required, owner only):
- `GET  /api/drawings/:id/agent-tokens` — list active tokens (prefix only).
- `POST /api/drawings/:id/agent-tokens` — mint one; response includes the
  full `token` once.
- `DELETE /api/drawings/:id/agent-tokens/:tokenId` — revoke.
---
## Full walkthrough (curl)
```bash
BASE="https://board.example.com/api"
DRAWING="ckxyz...the-drawing-id"
TOKEN="exd_...your-agent-token"
```
### 1. Read the structural summary
One line per non-deleted element in z-order, preceded by a header. This is the
cheap read path — drop it straight into an LLM prompt.
```bash
curl -s "$BASE/drawings/$DRAWING/summary" \
  -H "Authorization: Bearer $TOKEN"
```
```
# drawing "System Design" v7 (3 elements)
a1B2c3 rectangle 100,100 200×80 "Client"
d4E5f6 rectangle 500,100 200×80 "Server"
g7H8i9 arrow 300,140 200×0 a1B2c3->d4E5f6
```
Format of each element line:
```
id  type  x,y  w×h  [style digest]  "text≤60"  bindings
```
The style digest only lists non-default keys (e.g. `[stroke=#e03131 bg=#ffec99]`);
bindings show `start->end` for arrows and `in:<containerId>` for bound labels.
### 2. Inspect one element in full
Returns the raw Excalidraw element plus its bound-label children.
```bash
curl -s "$BASE/drawings/$DRAWING/elements/a1B2c3" \
  -H "Authorization: Bearer $TOKEN"
```
```json
{ "element": { "id": "a1B2c3", "type": "rectangle", "x": 100, ... },
  "children": [ { "id": "lbl_a1", "type": "text", "containerId": "a1B2c3", ... } ] }
```
### 3. Apply an ops batch
Add, connect, and lay out two boxes atomically. `ref` gives a created shape a
batch-local name; later ops target it with `$name`, without an id round-trip.
```bash
curl -s -X POST "$BASE/drawings/$DRAWING/ops" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientBatchId": "demo-1",
    "ops": [
      { "op": "add_shape", "ref": "client", "shape": "rectangle", "x": 100, "y": 100,
        "w": 200, "h": 80, "label": "Client" },
      { "op": "add_shape", "ref": "server", "shape": "rectangle", "x": 100, "y": 100,
        "w": 200, "h": 80, "label": "Server" },
      { "op": "connect", "fromId": "$client", "toId": "$server", "label": "HTTP" },
      { "op": "layout", "ids": ["$client", "$server"],
        "direction": "horizontal", "gap": 100 }
    ]
  }'
```
Success response:
```json
{
  "opsBatchId": "b0c1...uuid",
  "version": 8,
  "revertVersion": 7,
  "results": [
    { "opIndex": 0, "createdIds": ["a1B2c3", "lbl_a1"] },
    { "opIndex": 1, "createdIds": ["d4E5f6", "lbl_d4"] }
  ],
  "summaryDelta": [
    "a1B2c3 rectangle 100,100 200×80 \"Client\"",
    "d4E5f6 rectangle 500,100 200×80 \"Server\""
  ],
  "summary": "# drawing \"System Design\" v8 (5 elements)\n..."
}
```
- `version` — the new drawing version after the batch.
- `revertVersion` — the pre-batch version whose state was snapshotted; pass it
  to `revert_to_snapshot` to undo (see below).
- `results[].createdIds` — ids the applier minted, including bound labels.
- `summaryDelta` — one line per changed element (deleted elements read
  `<id> deleted`).
- `summary` — the full refreshed structural summary.
References are resolved strictly in order. A forward `$ref` or duplicate `ref`
rejects the entire batch.
### 4. Undo a batch (revert to snapshot)
`revert_to_snapshot` computes a compensating update from the `DrawingSnapshot`
written before the target batch and applies it through the same transaction — so
the revert is itself snapshotted and can be redone. Pass the `revertVersion` you
got back from the batch you want to undo:
```bash
curl -s -X POST "$BASE/drawings/$DRAWING/ops" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "ops": [ { "op": "revert_to_snapshot", "version": 7 } ] }'
```
`revert_to_snapshot` is intentionally not exposed as an LLM tool — it is a
REST/UI affordance only. A `SNAPSHOT_NOT_FOUND` error means the snapshot was
already pruned (see `SNAPSHOT_RETENTION_DAYS` in the
[Configuration Reference](CONFIGURATION.md)).
---
## Op schema reference
Batch envelope: `{ "ops": Op[]  (1..50), "clientBatchId"?: string }`.
| Op | Params | Behavior |
| --- | --- | --- |
| `add_shape` | `ref?`, `shape` (`rectangle`\|`ellipse`\|`diamond`\|`text`\|`frame`), `x`, `y`, `w?`, `h?`, `label?`, `style?` | Creates a shape. `ref` names it for later `$ref` use in the same batch. Labels are bound and wrapped, and the container grows vertically when needed. Returns `createdIds`. |
| `connect` | `fromId`, `toId`, `label?`, `style?`, `arrowType?` (`arrow`\|`line`) | Creates an arrow/line with `startBinding`/`endBinding` and updates both endpoints' `boundElements`. `ELEMENT_NOT_FOUND` per missing endpoint. |
| `set_text` | `id`, `text` | Sets text or a bound label; for frames, sets the native frame title (`name`). Text is sanitized. |
| `set_style` | `id`, `style` | Whitelist patch. Allowed keys: `strokeColor`, `backgroundColor`, `fillStyle`, `strokeWidth`, `strokeStyle`, `opacity`, `roughness`, `fontSize`, `fontFamily`, `textAlign`, `roundness`. Unknown key → `INVALID_STYLE_KEY`. |
| `move` | `id`, and **either** `dx,dy` **or** `x,y` (never both) | Moves the element with its bound label and reroutes attached arrows edge-to-edge. |
| `resize` | `id`, `w`, `h` | Resizes around the center, rewraps bound text, clamps height large enough for the label, and reroutes connectors. |
| `align` | `ids[]`, `alignment` (`left`\|`center`\|`right`\|`top`\|`middle`\|`bottom`) | Aligns two or more logical elements with their bound labels. |
| `distribute` | `ids[]`, `direction` (`horizontal`\|`vertical`), `gap?` | Distributes in current spatial order; explicit `gap` gives deterministic whitespace. |
| `layout` | `ids[]`, `direction` (`horizontal`\|`vertical`\|`grid`), `gap?`, `columns?`, `x?`, `y?` | Lays out ids in their supplied semantic order, then reroutes connectors. |
| `group` | `ids[]` | Adds one shared native Excalidraw group id to the logical elements and bound labels. |
| `delete` | `id` | Soft-deletes (`isDeleted:true`) the element and its bound label; detaches arrow bindings that referenced it. |
| `import_elements` | `elements[]` (raw Excalidraw JSON, 1..5000) | Insert-only escape hatch. Ids are remapped to fresh ids (never overwrites), everything is sanitized, and intra-batch binding references are remapped. |
| `revert_to_snapshot` | `version` | Compensating update from the snapshot at `version` (undo path). REST/UI only, not an LLM tool. |
Notes:
- `style` also accepts the same whitelisted keys as `set_style` on `add_shape`
  and `connect`.
- Id fields and `ids[]` accept existing element ids or `$name` for an
  `add_shape.ref` created earlier in the same batch.
- Text is always run through the server sanitizer; you cannot inject markup.
- Structural summaries include scene/type bounds, viewport state when available,
  groups, connections/bindings, and bounded overlap/label-overflow warnings.
---
## Error-code catalog
### Op-validation errors — `422 Unprocessable Entity`
If any op fails, **nothing is persisted**. The response lists every failing op:
```json
{ "error": "Ops validation failed",
  "errors": [ { "opIndex": 2, "code": "ELEMENT_NOT_FOUND",
                "message": "...", "elementId": "missing123" } ] }
```
| `code` | Meaning |
| --- | --- |
| `ELEMENT_NOT_FOUND` | A referenced `id`/`fromId`/`toId` does not exist in the scene (or earlier in the batch). `elementId` names it. |
| `INVALID_STYLE_KEY` | A `style` object contained a key outside the whitelist. |
| `INVALID_OP` | The op is structurally invalid beyond what the schema caught. |
| `DUPLICATE_REF` | Two creation ops used the same batch-local `ref`. |
| `INVALID_REFERENCE` | A `$ref` was missing or appeared before its creator. |
| `INVALID_ELEMENT_SET` | A layout/group operation included a missing or deleted element. |
| `SNAPSHOT_NOT_FOUND` | `revert_to_snapshot` referenced a version with no retained snapshot. |
| `UNSUPPORTED` | The op or a parameter combination is not supported. |
### Other status codes
| Status | Body `error` | Cause |
| --- | --- | --- |
| `400` | `Invalid ops batch` | Body failed zod validation (bad shape/enum, empty or >50 ops). `details` carries the zod issues. |
| `401` | `Unauthorized` | Missing/invalid/revoked bearer token. |
| `403` | `Forbidden` | Token cannot edit this drawing, or a drawing-scoped token was used on a different drawing/route, or a session user lacks edit rights. |
| `404` | `Drawing not found` / `Element not found` | The drawing or element does not exist, or you have no view access. |
| `409` | `Conflict` (`code: VERSION_CONFLICT`) | The scene changed concurrently and the server exhausted its retries; re-read the summary and retry the batch. |
| `429` | `Rate limit exceeded` | Too many ops batches; see below. |
---
## Rate limiting
`POST /api/drawings/:id/ops` has its own per-key/user limiter, separate from the
general API limit. Exceeding it returns `429` with
`{ "error": "Rate limit exceeded", "message": "Too many agent op batches, please slow down" }`
and standard `RateLimit-*` headers. Both bounds are configurable in the
registry (see the [Configuration Reference](CONFIGURATION.md)):
| Variable | Default | Meaning |
| --- | --- | --- |
| `AGENT_OPS_RATE_LIMIT_MAX` | `120` | Max ops batches per key/user per window. |
| `AGENT_OPS_RATE_LIMIT_WINDOW_MS` | `60000` | Window length in milliseconds (default 1 minute). |
The limiter keys on the authenticated user id (falling back to the request IP),
so all agent tokens owned by the same user share one budget.
---
## Audit events
When audit logging is enabled (`ENABLE_AUDIT_LOGGING`), the Agent API records:
| Action | When |
| --- | --- |
| `agent_ops_applied` | An ops batch committed. `details`: `opsBatchId`, `opCount`, `clientBatchId`. |
| `agent_token_created` | A drawing-scoped agent token was minted. `details`: `agentTokenId`. |
| `agent_token_revoked` | A drawing-scoped agent token was revoked. `details`: `agentTokenId`. |
| `chatgpt_connected` | A user linked their ChatGPT subscription. `details`: `accountId`, `plan`. |
| `chatgpt_disconnected` | A user unlinked their ChatGPT subscription. |
Each event carries the actor `userId`, the `drawing:<id>` resource, and the
request IP/user-agent. Admins can review them on the Admin → Audit page.
---
## Canvas assistant tools
The in-editor assistant uses two server-managed tools:
- Every new turn includes current structural state and attaches a bounded PNG
  for nonblank canvases. Blank state is explicit; images are transient and are
  never stored. `view_canvas` remains a compatibility fallback.
- `apply_ops` validates and atomically applies semantic drawing operations.
The chat is one server-owned transcript per drawing, shared live by authorized
collaborators and restored after refresh. The model can answer normally or
alternate `view_canvas`, `apply_ops`, and natural replies. SSE emits `tool_call` and
`tool_result` lifecycle events, answer text as `token`, and provider-supplied
reasoning summaries as `thinking`. The UI shows a collapsible **Thinking
summary**; hidden chain-of-thought and opaque signatures stay private. Providers
without summaries omit the event. Rejected tool calls remain recoverable.
OpenAI-compatible tool calls preserve opaque provider metadata across every
step. This includes Gemini's `extra_content.google.thought_signature`, which is
required when a Gemini thinking model continues after a function call.
The tool loop is capped at eight model steps. Reaching that cap emits
`TOOL_LIMIT_REACHED` instead of reporting a false success.
### Provider and model registry
Admins can configure multiple named AI provider profiles under **Admin → AI
provider registry**. Each profile has its own provider type, encrypted API key,
base URL, enabled state, model allow-list, and optional reasoning levels. One
profile is the default, but users can switch provider, model, and reasoning
level from the canvas chat without starting a new conversation.
`GET /ai/status` returns the non-secret registry; `GET /ai/chat/:drawingId/messages`
returns shared history. `POST /ai/chat` accepts `message`, `providerId`, `model`, and
`reasoningEffort`; every value is checked against the configured registry before
the provider adapter is called. OpenAI-compatible profiles forward
`reasoning_effort`, Anthropic profiles use `output_config.effort`, and ChatGPT
subscription models use the reasoning levels reported by the user's live model
catalog.
The original `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL` settings
remain a backward-compatible `legacy` profile; saving the registry preserves
its encrypted database key. Provider tests, discovery caching/fallback, source
research, and OpenCode Go are covered in [AI Provider Setup and
Discovery](AI_PROVIDERS.md).
## ChatGPT (subscription) provider
Alongside the API-key providers, the canvas assistant supports a per-user
**ChatGPT subscription** provider (`AI_PROVIDER=chatgpt`). Each user connects
their own ChatGPT Plus/Pro account. Tokens are stored per user and encrypted at
rest (same AES-256-GCM helper that protects API keys), refreshed transparently, and **never sent to the
browser**.
### Unofficial channel
This uses the **Codex sign-in flow** — the same OAuth client the Codex CLI uses
to reach the ChatGPT-backed Codex responses API
(`https://chatgpt.com/backend-api/codex/responses`). It is an **unofficial
channel**: OpenAI may change or block it at any time. When that happens the panel
surfaces a "reconnect" prompt and the API-key providers keep working — there are
no crash paths. Enable it only where billing usage to end users' own ChatGPT
plans is acceptable.
### How a user connects
1. Admin sets the provider to **ChatGPT (per-user subscription)** on
   Admin → AI Assistant (a toggle there is the enable/disable kill-switch,
   enabled by default).
2. In the canvas assistant each user clicks **Connect ChatGPT**. A ChatGPT tab
   opens (authorization-code + PKCE flow, CSRF-protected by a `state` tied to
   the user's session).
3. After approving, the browser lands on the Codex loopback redirect
   (`http://localhost:1455/auth/callback?code=…&state=…`), which does not load —
   the user copies that URL and pastes it back into the panel to finish. (A
   loopback listener is not reachable from a hosted web app, so the paste step
   replaces it; this also works behind a reverse proxy.)
> A **device-code** variant (`/deviceauth/usercode` + `/deviceauth/token`) is
> feasible for headless/reverse-proxied deployments and needs no redirect. It is
> documented here but not implemented — the redirect + paste flow is the primary
> path because it works everywhere without extra server configuration.
### The client-version knob
The ChatGPT backend gates the **available model set** on a `client_version` query
parameter. If a stale version is sent, models report as unsupported. This is
exposed as **`AI_CHATGPT_CLIENT_VERSION`** (default `0.142.5`) so a self-hoster
can bump it toward the current Codex CLI release — without a code change or
release — when models disappear. The offered model slugs come from
`AI_CHATGPT_MODELS` (default `gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna,
gpt-5.5, gpt-5.4, gpt-5.4-mini`; the first is the default). Configured models
remain available when the live ChatGPT catalog omits a Codex-capable slug. The OAuth client id, issuer,
redirect URI, and Codex base URL are likewise overridable
(`AI_CHATGPT_CLIENT_ID`, `AI_CHATGPT_ISSUER`, `AI_CHATGPT_REDIRECT_URI`,
`AI_CHATGPT_CODEX_BASE_URL`) for resilience if OpenAI moves an endpoint. See the
[Configuration Reference](CONFIGURATION.md).
### Endpoints
| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/ai/chatgpt/status` | Per-user connection state + provider availability. |
| `POST` | `/ai/chatgpt/connect` | Begin OAuth; returns the `authorizeUrl` to open. |
| `POST` | `/ai/chatgpt/callback` | Finish OAuth from the pasted redirect URL. |
| `POST` | `/ai/chatgpt/disconnect` | Revoke this user's stored connection. |
All four are session-only (never agent/API-key bearer principals) and CSRF-
protected. A `409 CHATGPT_RECONNECT` from `POST /ai/chat` (or a same-coded SSE
`error` event) means the user must reconnect.
---
## See also
- [Configuration Reference](CONFIGURATION.md) — all rate-limit, retention, and
  AI-provider variables.
- [Deployment Guide](DEPLOYMENT.md) — running behind a proxy, HTTPS, snapshots.
