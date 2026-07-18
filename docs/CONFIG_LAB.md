# ExcaliDash Configuration Lab

This lab starts multiple reproducible ExcaliDash configurations at the same
time so release candidates can be checked without repeatedly editing `.env`
files.

## Start

```bash
make lab-up
make lab-smoke
```

The first run builds local images and pulls the pinned Keycloak, SeaweedFS, and
AWS CLI images.

## Environments

| Variant | URL | Purpose |
| --- | --- | --- |
| Basic local auth | http://localhost:1101 | Default production-style SQLite install |
| Basic + SeaweedFS S3 | http://localhost:1102 | SQLite metadata with image files stored in SeaweedFS via S3 |
| OIDC enforced | http://localhost:1103 | Keycloak-only login flow |
| Hybrid auth | http://localhost:1104 | Local auth plus Keycloak OIDC |
| Trusted proxy | http://localhost:1105 | `TRUST_PROXY=true` CSRF/proxy behavior |
| OIDC + SeaweedFS S3 | http://localhost:1106 | Keycloak-only login with image files stored in SeaweedFS via S3 |
| Keycloak admin | http://localhost:18080/admin | OIDC provider admin UI |
| SeaweedFS filer | http://localhost:18888 | SeaweedFS file browser |
| SeaweedFS S3 | http://localhost:18333 | Local S3-compatible endpoint |

Keycloak admin login:

```text
username: admin
password: admin123!
```

The local Keycloak realm includes an `excalidash` client with
`excalidash-secret`. See `local/oidc/realm-excalidash-local.json` for full
realm details.

Seeded ExcaliDash OIDC users:

| Username | Password | Role |
| --- | --- | --- |
| admin | adminpass | ExcaliDash admin |
| alice | alicepass | ExcaliDash admin |
| bob | bobpass | ExcaliDash user |

The OIDC-backed app variants map the Keycloak `excalidash-admins` group to the
ExcaliDash `ADMIN` role via `OIDC_ADMIN_GROUPS=excalidash-admins`.

## Reset

```bash
make lab-reset
make lab-up
make lab-smoke
```

`lab-reset` removes the lab volumes, including all SQLite databases, backup
directories, and SeaweedFS data. After reset, the next `lab-up` recreates the
same clean environment.

## Daily Commands

```bash
make lab-status
make lab-logs
make lab-down
```

`lab-down` stops containers but keeps volumes. Use `lab-reset` when you need a
fresh first-run install.

The Keycloak realm JSON is imported when the Keycloak container is first
created. After changing `local/oidc/realm-excalidash-local.json`, recreate only
the Keycloak container to pick up the update. A full `lab-reset` is not required
and would delete all lab application and SeaweedFS data.

## SeaweedFS Details

The S3-backed app variants use:

```text
bucket: excalidash-lab
endpoint inside Docker: http://seaweedfs:8333
endpoint from host: http://localhost:18333
public URL: http://localhost:18333/excalidash-lab
```

`make lab-smoke` verifies the bucket exists and performs a put/head/delete
object round trip through the SeaweedFS S3 API.
