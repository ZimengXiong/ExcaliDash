---
title: "Self-Host Excalidraw on Kubernetes (Helm), Proxmox LXC & Unraid"
description: Deploy self-hosted Excalidraw with ExcaliDash on Kubernetes via community Helm charts, Proxmox VE via community-scripts LXC, or Unraid Docker Compose Manager.
---

# Self-host Excalidraw on Kubernetes (Helm), Proxmox LXC, and Unraid

ExcaliDash officially publishes Docker images (`linux/amd64` and `linux/arm64`) rather than Helm charts or LXC templates, and community options cover all three platforms: two Helm charts on ArtifactHub (`unxwares/excalidash` and `alekc/excalidash`) for Kubernetes, a Proxmox VE LXC script from `community-scripts`, and Unraid's Docker Compose Manager plugin. On every platform, keep the backend at one replica (`replicas: 1`).

| Platform        | Method                                    | Maintainer           | Notes                                               |
| --------------- | ----------------------------------------- | -------------------- | --------------------------------------------------- |
| Kubernetes      | `unxwares/excalidash` Helm chart          | UnxWares (community) | Chart appVersion `0.6.7`; override image tags       |
| Kubernetes      | `alekc/excalidash` Helm chart             | alekc (community)    | Chart appVersion `0.6.0`; override image tag values |
| Proxmox VE      | community-scripts LXC                     | community-scripts    | Builds from source on Debian 13; `amd64` only       |
| Unraid          | Docker Compose via Compose Manager plugin | Self-managed         | No Community Apps template yet                      |
| Any Docker host | [Docker Compose](/deploy/docker)          | ExcaliDash           | Reference deployment                                |

Pin image tags in your values or Compose file to the release you want (current: `0.7.0`).

## Why ExcaliDash requires a single backend replica

ExcaliDash holds Socket.IO room membership and presence state in backend process memory, and the default SQLite database is a single file on one volume. Running multiple backend replicas splits collaborators into separate processes so edits stop syncing across pods, and SQLite does not support concurrent writers from separate pods.

Keep backend `replicas: 1`, use `strategy.type: Recreate` when mounting a `ReadWriteOnce` PVC, and store `JWT_SECRET` and `CSRF_SECRET` in a Kubernetes `Secret` so sessions survive pod restarts. The frontend nginx Deployment can scale horizontally if needed, though one pod handles most teams.

## Excalidraw on Kubernetes with Helm

### `unxwares/excalidash` chart

```bash
helm repo add unxwares https://helm.unxwares.studio
helm repo update
helm show values unxwares/excalidash > values.yaml
helm install excalidash unxwares/excalidash -f values.yaml
```

- ArtifactHub: [unxwares/excalidash](https://artifacthub.io/packages/helm/unxwares/excalidash)
- Source: [UnxWares/helm](https://github.com/UnxWares/helm/tree/main/charts/excalidash)
- Images: `docker.io/zimengxiong/excalidash-frontend` and `docker.io/zimengxiong/excalidash-backend`

### `alekc/excalidash` chart

```bash
helm repo add alekc https://charts.alekc.dev
helm repo update
helm show values alekc/excalidash > values.yaml
helm install excalidash alekc/excalidash -f values.yaml
```

- ArtifactHub: [alekc/excalidash](https://artifacthub.io/packages/helm/alekc/excalidash)
- Source: [gitlab.com/alexander-chernov/helm/excalidash](https://gitlab.com/alexander-chernov/helm/excalidash)

### Required Helm values

| Setting                     | Value                                                                      |
| --------------------------- | -------------------------------------------------------------------------- |
| Image tags                  | Matching tag on frontend and backend, for example `0.7.0`                  |
| Backend replicas            | `1`                                                                        |
| Persistent volume           | Mounted at `/app/prisma` for SQLite, or set `DATABASE_PROVIDER=postgresql` |
| `FRONTEND_URL`              | Public `https://` Ingress origin                                           |
| `TRUST_PROXY`               | Ingress proxy hop count, typically `"1"`                                   |
| `JWT_SECRET`, `CSRF_SECRET` | Injected from a `Secret` (`openssl rand -hex 32`)                          |
| Frontend `BACKEND_URL`      | Backend Service `host:port` if named differently from `backend:8000`       |

### Ingress annotations for WebSockets and uploads

Route your Ingress to the frontend Service on port `8080`; nginx inside the frontend container proxies `/api/` and `/socket.io/` to the backend. For `ingress-nginx`, raise timeouts and body size limits so long whiteboarding sessions and pasted images do not drop:

```yaml
metadata:
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
```

Traefik IngressRoute and Ingress objects forward WebSocket upgrades without extra annotations.

## Excalidraw on Proxmox VE (LXC)

The [community-scripts ExcaliDash LXC script](https://community-scripts.org/scripts?id=excalidash) provisions an unprivileged Debian 13 container (defaults: 2 vCPU, 2048 MB RAM, 8 GB disk), downloads the latest GitHub release, builds with npm, and runs nginx alongside a systemd backend unit on port `8000`. Copy the install command from the community-scripts page and run it in the Proxmox host shell.

Differences from Docker Compose:

- `amd64` only.
- Upgrades run through the script's updater rather than `docker compose pull`.
- Config paths and systemd unit names differ from the Docker docs; check the script source to see where `FRONTEND_URL` and `TRUST_PROXY` are defined.

If you prefer prebuilt Docker images, create a Debian or Ubuntu LXC/VM, install Docker Engine, and follow [Deploy with Docker Compose](/deploy/docker).

## Excalidraw on Unraid

ExcaliDash does not have an Unraid Community Apps template yet. Run it through the Docker Compose Manager plugin:

1. Install Docker Compose Manager from Community Apps.
2. Open Docker → Compose → Add New Stack and name it `excalidash`.
3. Paste the standalone `docker-compose.yml` from [How to self-host Excalidraw](/guides/self-host-excalidraw#step-1-create-docker-compose-yml) and adjust the host port (default `6767`) if needed.
4. Put `JWT_SECRET` and `CSRF_SECRET` in the stack's `.env`, then click Compose Up.

If you bind-mount `/mnt/user/appdata` instead of using a Docker named volume, set UID `1001` ownership first:

```bash
mkdir -p /mnt/user/appdata/excalidash/data
chown -R 1001:1001 /mnt/user/appdata/excalidash/data
```

Map `/mnt/user/appdata/excalidash/data:/app/prisma` on the `backend` service.

Expose the stack through SWAG, Nginx Proxy Manager, or Traefik with WebSocket upgrades enabled on `/socket.io/`. See [Reverse proxy, HTTPS & WebSockets](/guides/excalidraw-reverse-proxy).

## Related

- [Deploy with Docker Compose](/deploy/docker)
- [Coolify, Portainer & Dokploy](/deploy/coolify-portainer)
- [How ExcaliDash works](/guides/how-excalidash-works)
- [PostgreSQL & S3 storage](/guides/excalidraw-postgresql-s3)
- [Environment variables reference](/reference/environment)
