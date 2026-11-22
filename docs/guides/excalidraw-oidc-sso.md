---
title: Self-Hosted Excalidraw with OIDC / SSO (Authentik, Keycloak, Pocket ID)
description: Add native OpenID Connect (OIDC) single sign-on to self-hosted Excalidraw with ExcaliDash. Includes Docker Compose config, callback URL, group-to-admin mapping, and setup notes for Authentik, Keycloak, Pocket ID, and Authelia.
---

# Self-hosted Excalidraw with OIDC / SSO

Putting the official `excalidraw/excalidraw` container behind reverse-proxy forward auth (like OAuth2 Proxy or Authelia) blocks unauthenticated access, but Excalidraw itself has no user model—there are no personal workspaces, drawing ownership, or per-collection permissions.

**ExcaliDash** supports native **OpenID Connect (OIDC)** single sign-on alongside local accounts, with automatic just-in-time (JIT) user provisioning and IdP group-to-admin mapping.

## Choose an authentication mode

Set `AUTH_MODE` on the `backend` container:

- `hybrid` — allows both OIDC SSO and local email/password accounts (useful during rollout or as a break-glass fallback).
- `oidc_enforced` — hides local login and registration so every user signs in through your identity provider.

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
```

Add `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET` to `.env`, then restart:

```bash
docker compose -f docker-compose.prod.yml -f compose.override.yml up -d
```

## Provider-specific settings

Register this exact callback URL in your identity provider (replace `draw.example.com` with your hostname):

```text
https://draw.example.com/api/auth/oidc/callback
```

### Authentik

1. Create an **OAuth2/OpenID Provider** + **Application** in Authentik.
2. Set Client type to **Confidential** and Redirect URI to `https://draw.example.com/api/auth/oidc/callback`.
3. Set `OIDC_ISSUER_URL` to `https://auth.example.com/application/o/excalidash/` (include the trailing slash shown in Authentik's OpenID Configuration Issuer field).
4. Include `groups` in `OIDC_SCOPES` if using `OIDC_ADMIN_GROUPS`.

### Keycloak

1. Create an **OpenID Connect** client in your realm with **Client authentication** enabled.
2. Add `https://draw.example.com/api/auth/oidc/callback` under **Valid redirect URIs**.
3. Set `OIDC_ISSUER_URL` to `https://keycloak.example.com/realms/YOUR_REALM`.
4. To map admin groups, add a Group Membership protocol mapper emitting the `groups` claim and set `OIDC_GROUPS_CLAIM=groups` and `OIDC_ADMIN_GROUPS`.

### Pocket ID

1. Create a new OIDC Client in Pocket ID and add `https://draw.example.com/api/auth/oidc/callback` as the callback URL.
2. Set `OIDC_ISSUER_URL` to `https://id.example.com`.
3. Set `OIDC_SCOPES` to `openid profile email groups` if mapping `OIDC_ADMIN_GROUPS`.

### Authelia

1. Add a confidential `identity_providers.oidc.clients` entry in Authelia's `configuration.yml` with `redirect_uris: ['https://draw.example.com/api/auth/oidc/callback']` and `scopes: ['openid', 'profile', 'email', 'groups']`.
2. Set `OIDC_ISSUER_URL` to `https://auth.example.com`.

## Troubleshooting

- **Redirect URI mismatch:** `OIDC_REDIRECT_URI` must match your provider's allowed redirect URI character-for-character, including `https://` and `/api/auth/oidc/callback`.
- **Reverse proxy headers:** Ensure `FRONTEND_URL` matches your public HTTPS URL and `TRUST_PROXY` matches your proxy hop count so session cookies are marked `Secure`.
- **Inspect discovery/token logs:**

```bash
docker compose -f docker-compose.prod.yml logs --tail=100 backend
```

For all OIDC variables (including `OIDC_CLIENT_SECRET_FILE` and custom claim names), see the [Authentication guide](/guide/authentication) and [Environment variables reference](/reference/environment#openid-connect).
