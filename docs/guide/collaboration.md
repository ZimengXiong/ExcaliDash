---
title: Real-Time Collaboration & Sharing
description: Share Excalidraw drawings and collections with view/edit roles, expiring links, live cursors, viewport follow mode, and API key Socket.IO sync.
---

# Self-hosted Excalidraw collaboration

ExcaliDash runs real-time Excalidraw collaboration on your own backend. Edits, cursors, presence avatars, and viewport updates sync over Socket.IO without sending drawings to third-party servers.

## Share a drawing

1. [Create local accounts](/guide/first-run) or [set up OpenID Connect](/guide/authentication) for your teammates.
2. Open a drawing and select **Share**.
3. Search for an account and assign **View** or **Edit** access.
4. Have collaborators open the drawing from **Shared with me** or via the drawing URL.

<ThemeScreenshot light="/images/screenshots/share-drawing-light.png" dark="/images/screenshots/share-drawing.png" alt="Share dialog with account search and view/edit permissions" />

### Live cursors and follow mode

When multiple people open the same drawing, named cursors and header avatars show who is active on the canvas. Select any collaborator's avatar in the editor header to follow their viewport as they pan and zoom—useful for design reviews and architecture walkthroughs. Panning or zooming yourself exits follow mode immediately.

<ThemeScreenshot light="/images/collaboration-light.png" dark="/images/collaboration-dark.png" alt="Live deployment diagram with collaborator avatars and named cursors" />

## Share a collection

Collections group related canvases under one permission set. Right-click a collection in the sidebar, select **Share Collection**, and choose who can view or edit the drawings inside it.

<ThemeScreenshot light="/images/screenshots/share-collection-light.png" dark="/images/screenshots/share-collection.png" alt="Share Collection dialog for Platform engineering" />

## Link sharing

Inside a drawing's **Share** dialog, switch **Link access** from **Restricted** to **Anyone with the link**, pick view or edit permission, set an optional expiration, and copy the URL. Revoke the link whenever access is no longer needed.

<ThemeScreenshot light="/images/screenshots/share-link-light.png" dark="/images/screenshots/share-link.png" alt="Drawing Share dialog with Link access menu open" />

## Socket.IO access with API keys

Automated clients and bots can join collaboration rooms using a personal API key (`exd_...`):

```js
import { io } from "socket.io-client";

const socket = io("https://draw.example.com", {
  auth: { token: process.env.EXCALIDASH_API_KEY },
});
```

- Pass the key in `auth.token` only; API keys are ignored if sent in cookies or query parameters.
- Joining a room requires `drawings:read`; sending updates requires `drawings:write`.
- Open sockets re-verify key validity, scopes, and account status on activity, so revoking a key disconnects or blocks further updates immediately.

## Reverse proxy WebSocket setup

When terminating HTTPS in front of ExcaliDash, your proxy must upgrade WebSocket connections on `/socket.io/`. Set `FRONTEND_URL` to your public origin and `TRUST_PROXY` to the number of trusted proxy hops. See [Reverse proxy & HTTPS](/guides/excalidraw-reverse-proxy).

## Troubleshoot live editing

If a drawing loads but changes do not sync between sessions:

- Confirm both sessions opened the same drawing and have edit permission.
- Verify your reverse proxy forwards `Upgrade` and `Connection` headers on `/socket.io/`.
- Check that `FRONTEND_URL` matches the exact browser origin, including `https://`.
- Inspect backend logs for WebSocket or permission errors:

```bash
docker compose -f docker-compose.prod.yml logs --tail=100 backend
```

Live collaboration syncs changes across active sessions; pair it with [storage and backups](/guide/storage-backups) to protect your workspace over time.
