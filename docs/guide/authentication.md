---
title: Self-hosted Excalidraw Authentication and OIDC
description: Configure local accounts or OpenID Connect for your self-hosted Excalidraw workspace, including sign-in modes and OIDC troubleshooting.
---

<script setup>
import { userManagementSlides, passwordResetSlides } from "../.vitepress/theme/screenshot-flows";
</script>

# Authentication

Choose how people sign in with `AUTH_MODE`:

| Mode            | Sign-in methods                        |
| --------------- | -------------------------------------- |
| `local`         | ExcaliDash accounts                    |
| `hybrid`        | ExcaliDash accounts and OpenID Connect |
| `oidc_enforced` | OpenID Connect only                    |
| `disabled`      | No sign-in; one shared identity        |

Use `disabled` only in an isolated, trusted environment. Every visitor has the same access.

## Local accounts

Complete [first-run setup](/guide/first-run). In **Admin**, select **New user** to create an account. Registration settings control whether people can create their own accounts.

<ScreenshotCarousel label="Admin registration settings and New User form" :slides="userManagementSlides" />

## Create an account

If the administrator has enabled registration, select **create a new account** on the sign-in page. Enter your name, email, password, and password confirmation, then select **Create account**. The one-time setup code is only needed when creating the first administrator.

<ThemeScreenshot light="/images/screenshots/registration-light.png" dark="/images/screenshots/registration.png" alt="Create account form for regular user registration" />

## Sign in

Enter your email address and password, then select **Sign in**. If you use OpenID Connect, follow the provider sign-in option configured for your instance.

<ThemeScreenshot light="/images/screenshots/signin-light.png" dark="/images/screenshots/signin.png" alt="Local email and password sign-in page" />

## Reset your password

The administrator must enable password reset and configure email delivery. See the [email settings](/reference/environment#email-and-password-reset).

<ScreenshotCarousel label="Request a reset link and set a new password" :slides="passwordResetSlides" />

## Configure OpenID Connect

1. In your identity provider, create an OpenID Connect client.
2. Register `https://YOUR_HOST/api/auth/oidc/callback` as its redirect URI. Replace `YOUR_HOST` with your ExcaliDash hostname.
3. Add the provider settings to `compose.override.yml`:

   ```yaml
   services:
     backend:
       environment:
         AUTH_MODE: hybrid
         FRONTEND_URL: https://draw.example.com
         OIDC_ISSUER_URL: ${OIDC_ISSUER_URL:?Set OIDC_ISSUER_URL}
         OIDC_CLIENT_ID: ${OIDC_CLIENT_ID:?Set OIDC_CLIENT_ID}
         OIDC_CLIENT_SECRET: ${OIDC_CLIENT_SECRET:?Set OIDC_CLIENT_SECRET}
         OIDC_REDIRECT_URI: https://draw.example.com/api/auth/oidc/callback
   ```

4. Replace `draw.example.com` with your hostname. Set the issuer URL, client ID, and client secret in the root `.env` file.
5. Apply the override:

   ```bash
   docker compose -f docker-compose.prod.yml -f compose.override.yml up -d
   ```

6. Open ExcaliDash and sign in with the provider.

Notes:
`OIDC_JIT_PROVISIONING=true` creates accounts on first sign-in. `OIDC_FIRST_USER_ADMIN=true` grants administrator access to the first provisioned OIDC user. Both default to `true`.

To require provider sign-in, set `AUTH_MODE` to `oidc_enforced`.

## Troubleshoot provider sign-in

Check that the redirect URI matches exactly, including the scheme and path. Read the backend logs for discovery or callback errors:

```bash
docker compose -f docker-compose.prod.yml logs --tail=100 backend
```

See the [environment reference](/reference/environment#openid-connect) for related settings.
