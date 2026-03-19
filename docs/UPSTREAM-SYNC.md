# Upstream Sync Guide

## Remotes

| Remote | URL | Purpose |
|--------|-----|---------|
| `origin` | Fork personal (GitHub) | Nuestro fork con PostgreSQL + Cloudflare |
| `upstream` | ZimengXiong/ExcaliDash | Proyecto original (SQLite) |

## Setup (una vez)

```bash
git remote add upstream https://github.com/ZimengXiong/ExcaliDash.git
git fetch upstream
```

## Merge desde upstream

```bash
git fetch upstream
git checkout main
git merge upstream/main
```

## Zonas de conflicto esperadas

| Archivo | Razón del conflicto |
|---------|---------------------|
| `backend/prisma/schema.prisma` | Provider `postgresql` vs `sqlite`, campos de tipo diferente |
| `docker-compose.yml` | Servicio `db` (PostgreSQL) no existe en upstream |
| `backend/docker-entrypoint.sh` | Lógica de migración PostgreSQL custom |

## Migraciones nuevas de upstream

Cuando upstream agrega migraciones SQLite:

1. Leer el SQL de la migración de upstream
2. Traducir DDL de SQLite a PostgreSQL (tipos, constraints, syntax)
3. Generar migración local:
   ```bash
   cd backend
   npx prisma migrate dev --name <nombre_descriptivo>
   ```
4. Verificar que `schema.prisma` tiene `provider = "postgresql"`
5. Testear la migración contra la DB local
