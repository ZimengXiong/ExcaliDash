---
title: First Run Setup
description: Choose an authentication mode, create your first ExcaliDash administrator, invite teammates, and harden your self-hosted workspace.
---

<script setup>
import { setupSlides, userManagementSlides, workspaceSlides } from "../.vitepress/theme/screenshot-flows";
</script>

# First run

Create the administrator account before opening the instance to anyone else. ExcaliDash starts in `local` authentication mode by default.

## Choose an authentication mode

Set `AUTH_MODE` to control how users sign in:

| Mode            | Behavior                                          |
| --------------- | ------------------------------------------------- |
| `local`         | ExcaliDash email and password accounts            |
| `hybrid`        | Local accounts alongside OpenID Connect           |
| `oidc_enforced` | OpenID Connect sign-in only                       |
| `disabled`      | No sign-in; every request shares one user profile |

::: danger Do not expose `AUTH_MODE=disabled` to untrusted networks
When authentication is disabled, anyone who can reach the URL has full access to the same shared workspace.
:::

## Create the administrator

Follow each screen of the default local-account setup below. If authentication is already enabled on the instance, start on step 2.

<ScreenshotCarousel label="Create the first administrator and open your first drawing" :slides="setupSlides" />

The one-time bootstrap code expires after 15 minutes (`BOOTSTRAP_SETUP_CODE_TTL_MS=900000`). If it expires before you finish, restart the backend container to issue a new code.

## Invite users

Open the account menu and select **Admin** to create local accounts manually or allow self-registration.

<ScreenshotCarousel label="Manage registration and create a local user" :slides="userManagementSlides" />

If you use OpenID Connect, [configure your OIDC provider](/guide/authentication#configure-openid-connect) before signing in. With the default `OIDC_FIRST_USER_ADMIN=true`, the first user provisioned through OIDC receives administrator access.

## Explore the workspace

New workspaces start empty. As you add drawings, ExcaliDash fits large canvases to your viewport automatically when you open them so you see the full diagram right away.

<ScreenshotCarousel label="Workspace organization, sharing, and live editing" :slides="workspaceSlides" />

[Sample drawing credits](/images/CREDITS.txt).

## Before exposing to the internet

Run through this checklist before placing ExcaliDash on a public host:

1. Put a reverse proxy with TLS in front of the frontend container.
2. Set explicit, persistent `JWT_SECRET` and `CSRF_SECRET` values in your root `.env`.
3. Keep `TRUST_PROXY=false` unless all traffic passes through a trusted proxy that strips spoofed forwarding headers.
4. Configure off-server backups and verify a restore.
5. Keep frontend and backend image tags pinned to the same version.

Continue to [Authentication](/guide/authentication).
