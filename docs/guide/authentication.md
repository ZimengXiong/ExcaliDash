---
title: Accounts, Auth Modes & API Keys
description: Manage ExcaliDash auth modes (local, hybrid, oidc_enforced, disabled), user accounts, password reset email, and scoped REST/Socket.IO API keys.
---

<script setup>
import { userManagementSlides, passwordResetSlides } from "../.vitepress/theme/screenshot-flows";
</script>

# Accounts, auth modes, and API keys

Control how people and scripts authenticate with `AUTH_MODE`:

| Mode            | Sign-in options                              |
| --------------- | -------------------------------------------- |
| `local`         | ExcaliDash email and password accounts       |
| `hybrid`        | Local accounts and OpenID Connect            |
| `oidc_enforced` | OpenID Connect only                          |
| `disabled`      | No sign-in; single shared workspace identity |

Keep `disabled` strictly on isolated, trusted networks.

## Local accounts

Finish [first-run setup](/guide/first-run), then open **Admin** from the account menu to create users with **New User** or toggle self-registration.

<ScreenshotCarousel label="Admin registration settings and New User form" :slides="userManagementSlides" />

### Self-registration

When self-registration is enabled, visitors can select **Create a new account** on the sign-in screen. Regular accounts only require a name, email, and password—the one-time bootstrap setup code is only for the first administrator.

<ThemeScreenshot light="/images/screenshots/registration-light.png" dark="/images/screenshots/registration.png" alt="Create account form for regular user registration" />

### Sign in

Enter your email and password, or select your configured OpenID Connect provider button.

<ThemeScreenshot light="/images/screenshots/signin-light.png" dark="/images/screenshots/signin.png" alt="Local email and password sign-in page" />

## Reset a password

Password reset requires `ENABLE_PASSWORD_RESET=true` and an email transport (SMTP or Resend). See [Email and password reset](/reference/environment#email-and-password-reset).

<ScreenshotCarousel label="Request a reset link and set a new password" :slides="passwordResetSlides" />

## Configure OpenID Connect

1. Create a confidential or PKCE OIDC client in your identity provider.
2. Add `https://YOUR_HOST/api/auth/oidc/callback` as an allowed redirect URI, replacing `YOUR_HOST` with your ExcaliDash hostname.
3. Add the provider configuration to `compose.override.yml`:

   ```yaml
   services:
     backend:
       environment:
         AUTH_MODE: hybrid
         FRONTEND_URL: https://draw.example.com
         OIDC_PROVIDER_NAME: Authentik
         OIDC_ISSUER_URL: ${OIDC_ISSUER_URL:?Set OIDC_ISSUER_URL}
         OIDC_CLIENT_ID: ${OIDC_CLIENT_ID:?Set OIDC_CLIENT_ID}
         OIDC_CLIENT_SECRET: ${OIDC_CLIENT_SECRET:?Set OIDC_CLIENT_SECRET}
         OIDC_REDIRECT_URI: https://draw.example.com/api/auth/oidc/callback
   ```

4. Put your real `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET` in the root `.env` file and replace `draw.example.com` with your domain.
5. Restart the stack with the override:

   ```bash
   docker compose -f docker-compose.prod.yml -f compose.override.yml up -d
   ```

6. Open ExcaliDash and sign in through your provider.

By default, `OIDC_JIT_PROVISIONING=true` creates user accounts on first login and `OIDC_FIRST_USER_ADMIN=true` makes the first provisioned OIDC user an administrator. To disable local passwords completely, set `AUTH_MODE: oidc_enforced`. You can also map identity-provider groups to ExcaliDash admin access with `OIDC_GROUPS_CLAIM` and `OIDC_ADMIN_GROUPS`.

### Troubleshoot OIDC sign-in

Verify that `OIDC_REDIRECT_URI` matches the provider registration character-for-character (including `https://` and `/api/auth/oidc/callback`). Check backend logs for discovery or token-exchange errors:

```bash
docker compose -f docker-compose.prod.yml logs --tail=100 backend
```

See the dedicated [OIDC & SSO setup guide](/guides/excalidraw-oidc-sso) for step-by-step Authentik, Keycloak, Pocket ID, Authelia, and Entra ID recipes, and the [OpenID Connect variables reference](/reference/environment#openid-connect) for all supported options.

## API keys

Create personal API keys (`exd_...`) from your account settings for automation or external integrations. Keys default to `drawings:read`, `drawings:write`, `collections:read`, and `collections:write` scopes.

- **REST API:** send the key in the `Authorization: Bearer exd_...` header.
- **Socket.IO:** pass the key explicitly in the handshake payload as `auth: { token: "exd_..." }`. API keys are never accepted from cookies or query strings.
- **Scope and revocation enforcement:** joining a drawing room requires `drawings:read`, and live edits require `drawings:write`. Active sockets authenticated by an API key are rechecked while open, so revoking a key or deactivating its owner cuts off access immediately. Keys cannot be used while a user has a pending forced password reset.

If you plan to use API keys in production, set `API_KEY_HASH_PEPPER` before generating keys so hashes remain valid across deployments.
