# ExcaliDash Configuration Lab

This lab starts multiple reproducible ExcaliDash configurations at the same
time so release candidates can be checked without repeatedly editing `.env`
files.

## Start

```bash
docker compose -f docker-compose.lab.yml up -d --build
./scripts/lab-smoke.sh
```

The first run builds local images and pulls the pinned Keycloak, SeaweedFS, and
AWS CLI images.

## Environments

| Variant              | URL                          | Purpose                                                     |
| -------------------- | ---------------------------- | ----------------------------------------------------------- |
| Basic local auth     | http://localhost:1101        | Default production-style SQLite install                     |
| Basic + SeaweedFS S3 | http://localhost:1102        | SQLite metadata with image files stored in SeaweedFS via S3 |
| OIDC enforced        | http://localhost:1103        | Keycloak-only login flow                                    |
| Hybrid auth          | http://localhost:1104        | Local auth plus Keycloak OIDC                               |
| Trusted proxy        | http://localhost:1105        | `TRUST_PROXY=true` CSRF/proxy behavior                      |
| Keycloak admin       | http://localhost:18080/admin | OIDC provider admin UI                                      |
| SeaweedFS filer      | http://localhost:18888       | SeaweedFS file browser                                      |
| SeaweedFS S3         | http://localhost:18333       | Local S3-compatible endpoint                                |

Keycloak admin login:

```text
username: admin
password: admin123!
```

The local Keycloak realm includes an `excalidash` client with
`excalidash-secret`. See `local/oidc/realm-excalidash-local.json` for full
realm details.

Seeded ExcaliDash OIDC users:

| Username | Password  | Role             |
| -------- | --------- | ---------------- |
| admin    | adminpass | ExcaliDash admin |
| alice    | alicepass | ExcaliDash admin |
| bob      | bobpass   | ExcaliDash user  |

The OIDC-backed app variants map the Keycloak `excalidash-admins` group to the
ExcaliDash `ADMIN` role via `OIDC_ADMIN_GROUPS=excalidash-admins`.

## Reset

```bash
docker compose -f docker-compose.lab.yml down -v --remove-orphans
docker compose -f docker-compose.lab.yml up -d --build
./scripts/lab-smoke.sh
```

`lab-reset` removes the lab volumes, including all SQLite databases, backup
directories, and SeaweedFS data. After reset, the next `lab-up` recreates the
same clean environment.

## Daily Commands

```bash
docker compose -f docker-compose.lab.yml ps
docker compose -f docker-compose.lab.yml logs -f
docker compose -f docker-compose.lab.yml down
```

`lab-down` stops containers but keeps volumes. Use `lab-reset` when you need a
fresh first-run install.

## SeaweedFS Details

The S3-backed app variant uses:

```text
bucket: excalidash-lab
endpoint inside Docker: http://seaweedfs:8333
endpoint from host: http://localhost:18333
public URL: http://localhost:18333/excalidash-lab
```

`./scripts/lab-smoke.sh` verifies the bucket exists and performs a put/head/delete
object round trip through the SeaweedFS S3 API.
