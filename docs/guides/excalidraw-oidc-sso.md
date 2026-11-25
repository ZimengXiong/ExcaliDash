---
title: "Excalidraw OIDC & SSO Setup: Authentik, Keycloak, Pocket ID & Authelia"
description: Configure native OpenID Connect (OIDC) SSO for self-hosted Excalidraw with Authentik, Keycloak, Pocket ID, Authelia, and Entra ID, plus group-to-admin mapping.
---

# Excalidraw OIDC and SSO setup: Authentik, Keycloak, Pocket ID, and Authelia

ExcaliDash includes native OpenID Connect (OIDC) authentication in its backend. Register `https://<your-host>/api/auth/oidc/callback` as the redirect URI in your identity provider, then set `AUTH_MODE` to `hybrid` (OIDC alongside local login) or `oidc_enforced` (OIDC only). The remaining values are `local` (default, local accounts only) and `disabled` (no sign-in, isolated single-user networks only).

```yaml
services:
  backend:
    environment:
      AUTH_MODE: hybrid
      FRONTEND_URL: https://draw.example.com
      TRUST_PROXY: "1"
      OIDC_ISSUER_URL: https://auth.example.com/application/o/excalidash/
      OIDC_CLIENT_ID: excalidash
      OIDC_CLIENT_SECRET: ${OIDC_CLIENT_SECRET}
      OIDC_REDIRECT_URI: https://draw.example.com/api/auth/oidc/callback
```

Placing the official `excalidraw/excalidraw` container behind reverse-proxy forward auth (Authelia, Authentik Proxy Provider, or OAuth2 Proxy) blocks unauthenticated visitors, yet Excalidraw still has no awareness of who is logged in. There are no per-user workspaces, drawing ownership, collection sharing, or automatic collaborator names.

ExcaliDash runs Authorization Code + PKCE (`S256`) directly in the backend with just-in-time (JIT) account provisioning and IdP group-to-admin role mapping.

## Native OIDC vs reverse-proxy forward auth

| Capability                            | Reverse-proxy forward auth + official Excalidraw | ExcaliDash native OIDC SSO  |
| ------------------------------------- | ------------------------------------------------ | --------------------------- |
| Blocks unauthenticated visitors       | Yes                                              | Yes                         |
| Per-user saved drawings & collections | No                                               | Yes                         |
| Granular drawing/collection sharing   | No                                               | Yes (View / Edit per user)  |
| Named live collaboration cursors      | Manual per session                               | Automatic from OIDC profile |
| Admin role via IdP groups             | No                                               | Yes (`OIDC_ADMIN_GROUPS`)   |

## Choosing an `AUTH_MODE`

Set `AUTH_MODE` on the `backend` container:

- `hybrid`: allows both OIDC SSO and local email/password login. Useful during rollout or to keep a break-glass local admin account.
- `oidc_enforced`: hides local login and registration so every user signs in through your identity provider.

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

Put `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET` in `.env` (or pass a mounted secret via `OIDC_CLIENT_SECRET_FILE`), then apply:

```bash
docker compose -f docker-compose.prod.yml -f compose.override.yml up -d
```

## Redirect URI (callback URL)

Register this exact redirect URI in your identity provider, substituting your public hostname:

```text
https://draw.example.com/api/auth/oidc/callback
```

## Identity provider setup recipes

### Authentik

1. Create an OAuth2/OpenID Provider in Authentik and bind it to an Application.
2. Set Client type to Confidential and Redirect URIs to `https://draw.example.com/api/auth/oidc/callback`.
3. Copy Authentik's OpenID Configuration Issuer into `OIDC_ISSUER_URL` (for example `https://auth.example.com/application/o/excalidash/`; keep the trailing slash if Authentik shows one).
4. Add `groups` to `OIDC_SCOPES` (`"openid profile email groups"`) when using `OIDC_ADMIN_GROUPS`.

### Keycloak

1. Create an OpenID Connect client in your realm with Client authentication enabled.
2. Add `https://draw.example.com/api/auth/oidc/callback` under Valid redirect URIs.
3. Set `OIDC_ISSUER_URL` to `https://keycloak.example.com/realms/YOUR_REALM`.
4. For admin mapping, add a Group Membership protocol mapper emitting `groups` in the ID token, and set `OIDC_GROUPS_CLAIM=groups` and `OIDC_ADMIN_GROUPS=excalidash-admins`.

### Pocket ID

1. Create an OIDC Client in Pocket ID with callback URL `https://draw.example.com/api/auth/oidc/callback`.
2. Set `OIDC_ISSUER_URL` to `https://id.example.com` and `OIDC_PROVIDER_NAME` to `Pocket ID`.
3. Set `OIDC_SCOPES` to `"openid profile email groups"` if mapping `OIDC_ADMIN_GROUPS`.

### Authelia

1. Add a confidential client under `identity_providers.oidc.clients` in Authelia's `configuration.yml` with `redirect_uris: ['https://draw.example.com/api/auth/oidc/callback']` and `scopes: ['openid', 'profile', 'email', 'groups']`.
2. Set `OIDC_ISSUER_URL` to your Authelia root URL (such as `https://auth.example.com`).
3. Set `OIDC_PROVIDER_NAME: Authelia` and restart ExcaliDash.

### Microsoft Entra ID, Okta, and Google Workspace

Any standard OpenID Connect provider uses the same variables:

| Provider           | `OIDC_ISSUER_URL`                                    | Client setup                                             |
| ------------------ | ---------------------------------------------------- | -------------------------------------------------------- |
| Microsoft Entra ID | `https://login.microsoftonline.com/<TENANT_ID>/v2.0` | Web redirect URI `https://<host>/api/auth/oidc/callback` |
| Okta               | `https://<your-domain>.okta.com/oauth2/default`      | Web App using Authorization Code flow                    |
| Google Workspace   | `https://accounts.google.com`                        | OAuth 2.0 Web Application client ID                      |

## Split-horizon DNS and internal Docker networks

When your IdP runs on the same Docker host and the backend container cannot reach its public HTTPS hostname (hairpin NAT), keep `OIDC_ISSUER_URL` set to the public issuer string and point `OIDC_DISCOVERY_URL` at the internal container URL (for example `http://keycloak:8080/realms/excalidash/`).

## Troubleshooting OIDC login

| Symptom                                  | Likely cause                            | Fix                                                                                          |
| ---------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| `redirect_uri_mismatch` at IdP           | Mismatch in scheme, host, or path       | Match `OIDC_REDIRECT_URI` character-for-character to `https://<host>/api/auth/oidc/callback` |
| Redirects back to sign-in after callback | Session cookie dropped on HTTPS proxy   | Set `FRONTEND_URL=https://<host>` and `TRUST_PROXY` to your proxy hop count                  |
| Discovery fetch timeout on startup       | Container cannot resolve public IdP URL | Set `OIDC_DISCOVERY_URL` to the internal address or fix Docker DNS                           |
| Admin group not applied                  | Group claim missing from ID token       | Add `groups` to `OIDC_SCOPES` and verify `OIDC_GROUPS_CLAIM` matches the token claim         |

Check backend logs for OIDC errors:

```bash
docker compose -f docker-compose.prod.yml logs --tail=100 backend
```

For local accounts, password resets, and API keys, see [Accounts, auth modes & API keys](/guide/authentication) and the [OpenID Connect environment reference](/reference/environment#openid-connect).
