---
title: Excalidraw OIDC & SSO Setup
description: Configure native OpenID Connect (OIDC) SSO for self-hosted Excalidraw with Authentik, Keycloak, Pocket ID, Authelia, and group-to-admin mapping.
---

# Self-hosted Excalidraw with OIDC / SSO

Putting the official `excalidraw/excalidraw` container behind reverse-proxy forward auth (such as Authelia, Authentik Proxy Provider, or OAuth2 Proxy) restricts page access, but Excalidraw itself still has no concept of users—there are no personal dashboards, drawing ownership, collection permissions, or named collaborators.

**ExcaliDash** implements native **OpenID Connect (OIDC)** single sign-on directly in the backend with just-in-time (JIT) user provisioning, optional group-to-admin mapping, and full per-user workspaces.

## Native OIDC vs reverse-proxy forward auth

| Capability                            | Reverse-proxy forward auth + official Excalidraw | ExcaliDash native OIDC SSO  |
| ------------------------------------- | ------------------------------------------------ | --------------------------- |
| Blocks unauthenticated visitors       | Yes                                              | Yes                         |
| Per-user saved drawings & collections | No                                               | Yes                         |
| Granular drawing/collection sharing   | No                                               | Yes (View / Edit per user)  |
| Named live collaboration cursors      | Manual per session                               | Automatic from OIDC profile |
| Admin role via IdP groups             | No                                               | Yes (`OIDC_ADMIN_GROUPS`)   |

## Choose an authentication mode

Set `AUTH_MODE` on the `backend` service:

- `hybrid` — enables both OIDC SSO and local email/password sign-in (best during initial rollout or for a break-glass local admin account).
- `oidc_enforced` — hides local login and registration completely so every user authenticates exclusively through your identity provider.

## Docker Compose configuration

Create `compose.override.yml` next to `docker-compose.prod.yml`:

```yaml
services:
  backend:
    environment:
      AUTH_MODE: oidc_enforced
      FRONTEND_URL: https://draw.example.com
      TRUST_PROXY: "1"
      OIDC_PROVIDER_NAME: Authentik
      OIDC_ISSUER_URL: ${OIDC_ISSUER_URL:?Set OIDC_ISSUER_URL}
      OIDC_CLIENT_ID: ${OIDC_CLIENT_ID:?Set OIDC_CLIENT_ID}
      OIDC_CLIENT_SECRET: ${OIDC_CLIENT_SECRET:?Set OIDC_CLIENT_SECRET}
      OIDC_REDIRECT_URI: https://draw.example.com/api/auth/oidc/callback
      OIDC_SCOPES: "openid profile email"
      OIDC_JIT_PROVISIONING: "true"
      OIDC_FIRST_USER_ADMIN: "true"
      # Optional: map an IdP group claim to ExcaliDash administrators
      # OIDC_GROUPS_CLAIM: groups
      # OIDC_ADMIN_GROUPS: excalidash-admins,administrators
      # Optional: backend-only discovery URL on an internal Docker/LAN network
      # OIDC_DISCOVERY_URL: http://keycloak:8080/realms/my-realm/
```

Store `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET` in `.env` (or mount the secret via `OIDC_CLIENT_SECRET_FILE`), then apply:

```bash
docker compose -f docker-compose.prod.yml -f compose.override.yml up -d
```

## Callback URL

Register this exact redirect URI in your identity provider (replacing `draw.example.com` with your public domain):

```text
https://draw.example.com/api/auth/oidc/callback
```

## Provider setup recipes

### Authentik

1. Create an **OAuth2/OpenID Provider** and attach it to a new **Application** in Authentik.
2. Set **Client type** to **Confidential** and **Redirect URIs** to `https://draw.example.com/api/auth/oidc/callback`.
3. Copy Authentik's **OpenID Configuration Issuer** into `OIDC_ISSUER_URL` (for example `https://auth.example.com/application/o/excalidash/`—keep the trailing slash if Authentik displays one).
4. Include `groups` in `OIDC_SCOPES` (`"openid profile email groups"`) when using `OIDC_ADMIN_GROUPS`.

### Keycloak

1. In your realm, create an **OpenID Connect** client with **Client authentication** turned on.
2. Add `https://draw.example.com/api/auth/oidc/callback` under **Valid redirect URIs**.
3. Set `OIDC_ISSUER_URL` to `https://keycloak.example.com/realms/YOUR_REALM`.
4. To map Keycloak groups to ExcaliDash admins, add a **Group Membership** protocol mapper on the client emitting the `groups` claim in the ID token, and set `OIDC_GROUPS_CLAIM=groups` and `OIDC_ADMIN_GROUPS=excalidash-admins`.

### Pocket ID

1. Create a new **OIDC Client** in Pocket ID with callback URL `https://draw.example.com/api/auth/oidc/callback`.
2. Set `OIDC_ISSUER_URL` to `https://id.example.com` and `OIDC_PROVIDER_NAME` to `Pocket ID`.
3. Set `OIDC_SCOPES` to `"openid profile email groups"` if mapping `OIDC_ADMIN_GROUPS`.

### Authelia

1. Add a confidential entry under `identity_providers.oidc.clients` in Authelia's `configuration.yml`:
   - `redirect_uris: ['https://draw.example.com/api/auth/oidc/callback']`
   - `scopes: ['openid', 'profile', 'email', 'groups']`
2. Set `OIDC_ISSUER_URL` to your Authelia root URL (for example `https://auth.example.com`).
3. Keep `OIDC_PROVIDER_NAME: Authelia` and restart ExcaliDash.

### Microsoft Entra ID, Okta, or Google Workspace

Any standards-compliant OpenID Connect provider works with the same environment variables:

- **Microsoft Entra ID:** `OIDC_ISSUER_URL=https://login.microsoftonline.com/<TENANT_ID>/v2.0`, add Web redirect URI `https://draw.example.com/api/auth/oidc/callback`.
- **Okta:** `OIDC_ISSUER_URL=https://<your-domain>.okta.com/oauth2/default`, create a Web App with Authorization Code flow.
- **Google Workspace:** `OIDC_ISSUER_URL=https://accounts.google.com`, create an OAuth 2.0 Web Application client ID.

## Split-horizon DNS and internal Docker networks

If your identity provider runs on the same Docker host and the backend container cannot reach its public HTTPS hostname (hairpin NAT), set `OIDC_ISSUER_URL` to the browser-facing URL and `OIDC_DISCOVERY_URL` to the internal container URL (for example `http://keycloak:8080/realms/excalidash/`).

## Troubleshooting OIDC sign-in

| Symptom                                  | Likely cause                            | Fix                                                                                          |
| ---------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| `redirect_uri_mismatch` at IdP           | Mismatch in scheme, host, or path       | Match `OIDC_REDIRECT_URI` character-for-character to `https://<host>/api/auth/oidc/callback` |
| Redirects back to sign-in after callback | Session cookie dropped on HTTPS proxy   | Set `FRONTEND_URL=https://<host>` and `TRUST_PROXY` to your proxy hop count                  |
| Discovery fetch timeout on startup       | Container cannot resolve public IdP URL | Set `OIDC_DISCOVERY_URL` to the internal address or fix Docker DNS                           |
| Admin group not applied                  | Group claim missing from ID token       | Add `groups` to `OIDC_SCOPES` and verify `OIDC_GROUPS_CLAIM` matches the token claim         |

Inspect backend OIDC logs with:

```bash
docker compose -f docker-compose.prod.yml logs --tail=100 backend
```

For local account management, password resets, and API keys, see [Accounts, auth modes & API keys](/guide/authentication) and the [OpenID Connect environment reference](/reference/environment#openid-connect).
