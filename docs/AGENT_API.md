# Agent API

The Agent API lets programs (AI agents, scripts, integrations) read and edit a
drawing over plain HTTPS. Edits go through **semantic ops** that are applied
atomically on the server: the whole batch is validated against the authoritative
scene, applied in one transaction, snapshotted for undo, sanitized, and
version-bumped — exactly like a normal save. Open editors receive the changes
live over the existing socket relay.

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
4. Revoke any time from the same panel.

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

Add two boxes and connect them. The applier generates ids and bindings.

```bash
curl -s -X POST "$BASE/drawings/$DRAWING/ops" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientBatchId": "demo-1",
    "ops": [
      { "op": "add_shape", "shape": "rectangle", "x": 100, "y": 100,
        "w": 200, "h": 80, "label": "Client" },
      { "op": "add_shape", "shape": "rectangle", "x": 500, "y": 100,
        "w": 200, "h": 80, "label": "Server" }
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

Reference the returned ids in a later batch, e.g. to connect them:

```bash
curl -s -X POST "$BASE/drawings/$DRAWING/ops" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{ "ops": [
    { "op": "connect", "fromId": "a1B2c3", "toId": "d4E5f6", "label": "HTTP" }
  ] }'
```

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
| `add_shape` | `shape` (`rectangle`\|`ellipse`\|`diamond`\|`text`\|`frame`), `x`, `y`, `w?`, `h?`, `label?`, `style?` | Creates a shape. `label` becomes a bound text child with correct `containerId`/`boundElements`. Returns `createdIds`. |
| `connect` | `fromId`, `toId`, `label?`, `style?`, `arrowType?` (`arrow`\|`line`) | Creates an arrow/line with `startBinding`/`endBinding` and updates both endpoints' `boundElements`. `ELEMENT_NOT_FOUND` per missing endpoint. |
| `set_text` | `id`, `text` | Sets the element's own text or its bound label (creating the label if none). Text is sanitized. |
| `set_style` | `id`, `style` | Whitelist patch. Allowed keys: `strokeColor`, `backgroundColor`, `fillStyle`, `strokeWidth`, `strokeStyle`, `opacity`, `roughness`, `fontSize`, `fontFamily`, `textAlign`, `roundness`. Unknown key → `INVALID_STYLE_KEY`. |
| `move` | `id`, and **either** `dx,dy` **or** `x,y` (never both) | Moves the element with its bound label and rebinds attached arrows. |
| `delete` | `id` | Soft-deletes (`isDeleted:true`) the element and its bound label; detaches arrow bindings that referenced it. |
| `import_elements` | `elements[]` (raw Excalidraw JSON, 1..5000) | Insert-only escape hatch. Ids are remapped to fresh ids (never overwrites), everything is sanitized, and intra-batch binding references are remapped. |
| `revert_to_snapshot` | `version` | Compensating update from the snapshot at `version` (undo path). REST/UI only, not an LLM tool. |

Notes:

- `style` also accepts the same whitelisted keys as `set_style` on `add_shape`
  and `connect`.
- Ids you reference (`id`, `fromId`, `toId`) must be **existing** element ids —
  either already in the scene or created earlier **in the same batch**.
- Text is always run through the server sanitizer; you cannot inject markup.

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

Each event carries the actor `userId`, the `drawing:<id>` resource, and the
request IP/user-agent. Admins can review them on the Admin → Audit page.

---

## See also

- [Configuration Reference](CONFIGURATION.md) — all rate-limit, retention, and
  AI-provider variables.
- [Deployment Guide](DEPLOYMENT.md) — running behind a proxy, HTTPS, snapshots.
