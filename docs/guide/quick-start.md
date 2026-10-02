# Quick start

Run ExcaliDash with Docker Compose.

## Prerequisites

- Docker Engine or Docker Desktop
- Docker Compose v2
- Port `6767` available on the host

## Start ExcaliDash

1. Clone the repository:

   ```bash
   git clone https://github.com/ZimengXiong/ExcaliDash.git
   cd ExcaliDash
   ```

2. Start the services:

   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

3. Open `http://localhost:6767`.
4. [Create the administrator account](/guide/first-run#create-the-administrator).

::: tip Data persists between restarts
SQLite data and generated secrets are stored in `backend-data`. The `down` command preserves this volume; adding `-v` deletes it.
:::

## Check the services

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f
```

Both services have health checks. Port `6767` serves the frontend and proxies backend requests.

## Stop the stack

```bash
docker compose -f docker-compose.prod.yml down
```

Continue with [your workspace](/guide/workspace). For a server deployment, see [Deploy with Docker Compose](/deploy/docker).
