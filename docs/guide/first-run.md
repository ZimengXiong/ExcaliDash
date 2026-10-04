---
title: Set Up Your ExcaliDash Workspace
description: Create your ExcaliDash administrator account, invite users, and organize your first Excalidraw drawings into collections.
---

<script setup>
import { setupSlides, userManagementSlides, workspaceSlides } from "../.vitepress/theme/screenshot-flows";
</script>

# First run

Create the administrator account before inviting other users. The default authentication mode is `local`.

## Choose an authentication mode

| Mode            | Best for                                   |
| --------------- | ------------------------------------------ |
| `local`         | ExcaliDash accounts                        |
| `hybrid`        | Local accounts and OpenID Connect          |
| `oidc_enforced` | OpenID Connect only                        |
| `disabled`      | Personal use in isolated environments only |

::: danger Do not expose disabled authentication publicly
`AUTH_MODE=disabled` gives every visitor the same identity and access.
:::

## Create the administrator

Use the arrows to follow each screen of the default local-account setup. If authentication is already enabled, start at the administrator form.

<ScreenshotCarousel label="Create the first administrator and open your first drawing" :slides="setupSlides" />

Setup codes expire after 15 minutes by default.

## Invite users

Open **Admin** to create another local account or enable self-registration.

<ScreenshotCarousel label="Manage registration and create a local user" :slides="userManagementSlides" />

For OpenID Connect (OIDC), [configure the provider](/guide/authentication#configure-openid-connect) before signing in. `OIDC_FIRST_USER_ADMIN=true` makes the first provisioned OIDC user an administrator.

## Your workspace

Use the arrows to explore an established example workspace, drawing sharing, and live collaboration.

<ScreenshotCarousel label="Workspace organization and sharing" :slides="workspaceSlides" />

[Sample drawing credits](/images/CREDITS.txt).

## Securing your instance

Before exposing ExcaliDash beyond a local machine:

- Terminate TLS at a trusted reverse proxy.
- Set stable `JWT_SECRET` and `CSRF_SECRET` values.
- Keep `TRUST_PROXY=false` unless requests always pass through a trusted proxy.
- Persist the database and test a restore procedure.
- Keep frontend and backend image tags aligned.

Next: [Configure authentication](/guide/authentication).
