# ExcaliDash Helm chart

Deploys ExcaliDash (backend + nginx frontend) using the upstream Docker Hub images
`zimengxiong/excalidash-{backend,frontend}`. The image tag defaults to the chart `appVersion`.

```bash
helm install excalidash oci://ghcr.io/ZimengXiong/charts/excalidash --version <VERSION> \
  --set ingress.enabled=true \
  --set 'ingress.hosts[0].host=excalidash.example.com' \
  --set 'ingress.tls[0].secretName=excalidash-tls' \
  --set secrets.existingSecret=excalidash-secrets
```

Secrets are **required** and never generated (see [Secrets](#secrets)). The backend always runs a single
replica: there is no Socket.IO adapter, caches are in memory and startup migrations/the RWO volume assume one pod.

First-run setup code: `kubectl logs deploy/excalidash-excalidash-backend | grep "BOOTSTRAP SETUP"`.

## Database options

| Mode | How |
| --- | --- |
| SQLite (default) | A PVC at `/app/prisma`, `Recreate` strategy. |
| External PostgreSQL | `global.externalDatabase.url` **or** `global.externalDatabase.existingSecret` (+ `existingSecretKey`), not both. |
| Bundled PostgreSQL | `postgresql.enabled=true` plus `postgresql.auth.password` **or** `postgresql.auth.existingSecret`, not both. Runs the official `postgres:17-alpine` image as a StatefulSet. |

The bundled PostgreSQL is rendered **only** when `postgresql.enabled=true` and no external database is configured.
Setting `global.externalDatabase.*` always wins, even if `postgresql.enabled` is left on.

The image pulls anonymously from Docker Hub. To use a mirror (or avoid Docker Hub's anonymous pull limit), set
`postgresql.image.repository` and, if the mirror is private, `postgresql.imagePullSecrets`.

Bundled PostgreSQL passwords may only contain `A-Z a-z 0-9 . _ ~ -` because they are embedded in `DATABASE_URL`
(the same applies to values in an `existingSecret`). `backups.enabled` only works with SQLite and fails the render otherwise.

Switching an existing install between SQLite and PostgreSQL does not migrate data; use the dashboard Export/Import.

## Secrets

Nothing is generated, so renders are deterministic and safe with Argo CD / `helm template`. Provide **exactly one** of:

- `secrets.existingSecret`: a Secret with `JWT_SECRET`, `CSRF_SECRET`, `API_KEY_HASH_PEPPER` and, for confidential
  OIDC clients, `OIDC_CLIENT_SECRET`;
- all of `secrets.jwtSecret` (at least 32 characters), `secrets.csrfSecret` and `secrets.apiKeyHashPepper` inline.

Setting both, a partial inline set, or `secrets.oidcClientSecret` together with `existingSecret` fails the render.
Never change `API_KEY_HASH_PEPPER` once API keys exist; it invalidates them.

## Ingress and proxy

All traffic goes through the frontend nginx (it proxies `/api/` and `/socket.io/`). For ingress-nginx:

```yaml
ingress:
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-body-size: 50m
```

`TRUST_PROXY` is derived from the topology: `1` (frontend nginx) without ingress, `2` (ingress + frontend nginx)
with `ingress.enabled`. Override with `backend.env.trustProxy` only if you add or remove proxy hops; a wrong value
makes every client share one rate-limit bucket.

`networkPolicy.enabled=true` restricts the backend to traffic from the frontend (and bundled PostgreSQL to the backend).

## OIDC

```yaml
backend: {env: {authMode: hybrid}}   # or oidc_enforced
oidc:
  enabled: true
  providerName: Authentik
  issuerUrl: https://auth.example.com/application/o/excalidash/
  clientId: excalidash
secrets:
  existingSecret: excalidash-secrets   # contains OIDC_CLIENT_SECRET
```

The redirect URI (`oidc.redirectUri`, else `<first ingress host>/api/auth/oidc/callback`) must be `https://`;
the render fails otherwise because the backend refuses to start with an HTTP URI in production.

See `values.yaml` for every option.
