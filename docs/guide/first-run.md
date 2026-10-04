---
title: Set Up Your ExcaliDash Workspace
description: Create your ExcaliDash administrator account, invite users, and organize your first Excalidraw drawings into collections.
---

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

<ThemeScreenshot light="/images/screenshots/auth-setup-light.png" dark="/images/screenshots/auth-setup.png" alt="First-run authentication choice with Enable Authentication and Continue Without Auth" />

## Create the administrator

For the default `local` mode:

1. Open your ExcaliDash URL. If prompted to choose an authentication mode, select **Enable Authentication**, then **Create account**.
2. If the form asks for a one-time setup code, read the backend logs:

   ```bash
   docker compose -f docker-compose.prod.yml logs --tail=200 backend
   ```

   Find the entry labeled `BOOTSTRAP SETUP`. In local development, the code appears in the backend terminal.

3. Enter the code, your account details, and create a password.
4. Select **Create account**. Use this account to manage the instance.

<ThemeScreenshot light="/images/screenshots/signup-light.png" dark="/images/screenshots/signup.png" alt="Create the first administrator account with the one-time setup code" />

Setup codes expire after 15 minutes by default.

To add an account, open **Admin** and select **New user**. To let people register themselves, enable registration in **Admin**.

<ThemeScreenshot light="/images/screenshots/new-user-light.png" dark="/images/screenshots/new-user.png" alt="Admin New User form with name, email, password, and role fields" />

For OpenID Connect (OIDC), [configure the provider](/guide/authentication#configure-openid-connect) before signing in. `OIDC_FIRST_USER_ADMIN=true` makes the first provisioned OIDC user an administrator.

## Your workspace

Create drawings and organize them into collections.

<ThemeScreenshot light="/images/workspace-light.png" dark="/images/workspace.png" alt="All Drawings dashboard with drawings organized into collections" />

Select **Share** to grant access. Collaborators appear as avatars and named cursors.

<ThemeScreenshot light="/images/screenshots/share-drawing-light.png" dark="/images/screenshots/share-drawing.png" alt="Drawing Share controls open for adding people and choosing access" />

<ThemeScreenshot light="/images/collaboration-light.png" dark="/images/collaboration-dark.png" alt="Live deployment drawing with collaborator avatars and named cursors" />

[Sample drawing credits](/images/CREDITS.txt).

## Securing your instance

Before exposing ExcaliDash beyond a local machine:

- Terminate TLS at a trusted reverse proxy.
- Set stable `JWT_SECRET` and `CSRF_SECRET` values.
- Keep `TRUST_PROXY=false` unless requests always pass through a trusted proxy.
- Persist the database and test a restore procedure.
- Keep frontend and backend image tags aligned.

Next: [Configure authentication](/guide/authentication).
