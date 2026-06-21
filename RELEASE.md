Release date: 2026-04-17

| Area | Key Changes |
|------|-------------|
| **OIDC hardening** | ID token signing alg resolution with discovery fallback + explicit override (`OIDC_ID_TOKEN_SIGNED_RESPONSE_ALG`), token endpoint auth method override (`OIDC_TOKEN_ENDPOINT_AUTH_METHOD`), HS-alg mismatch auto-retry in callback, Keycloak/Authentik preflight warnings, `oidc-doctor.cjs` diagnostic tool, provider-specific `.env` example files |
| **Admin OIDC controls** | Runtime JIT provisioning toggle via admin panel + DB (`oidcJitProvisioningEnabled` column + migration), OIDC-only invited user creation (`oidcOnly` flag), block self-registration toggle in `oidc_enforced` mode |
| **HTTPS redirect policy** | Refactored into pure `httpsRedirectPolicy.ts` module, new `ENFORCE_HTTPS_REDIRECT` env var, mixed http/https `FRONTEND_URL` support, IPv4 loopback healthchecks |
| **Frontend resilience** | `AuthStatusErrorPanel` with retry for backend connectivity failures, `registrationEnabled` propagation to hide register link/route, multi-image drag-and-drop import in Editor, Excalidraw asset copy script for dev + build |

## Upgrading

<details>
<summary>Show upgrade steps</summary>

### Data safety checklist

- Back up backend volume (`dev.db`, secrets) before upgrading.
- Let migrations run on startup (`RUN_MIGRATIONS=true`) for normal deploys.
- Run `docker compose -f docker-compose.prod.yml logs backend --tail=200` after rollout and verify startup/migration status.

### Recommended upgrade (Docker Hub compose)

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

### Pin images to this release (recommended for reproducible deploys)

Edit `docker-compose.prod.yml` and pin the release tags:

```yaml
services:
  backend:
    image: zimengxiong/excalidash-backend:v0.5.0
  frontend:
    image: zimengxiong/excalidash-frontend:v0.5.0
```

Example:

```bash
docker compose -f docker-compose.prod.yml up -d
```

</details>
