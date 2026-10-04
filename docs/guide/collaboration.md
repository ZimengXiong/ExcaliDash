---
title: Self-hosted Excalidraw Collaboration and Sharing
description: Collaborate on Excalidraw drawings with your own ExcaliDash server. Share drawings and collections, manage access, and troubleshoot live editing.
---

# Self-hosted Excalidraw collaboration

ExcaliDash lets people edit Excalidraw drawings together while storing them on your own server. The frontend and backend in the [Docker Compose deployment](/deploy/docker) provide the workspace and real-time connection.

## Share a drawing with your team

1. [Create accounts](/guide/first-run) for the people who will use your workspace, or [configure OpenID Connect](/guide/authentication).
2. Create or open a drawing and select **Share**.
3. Add the account you want to invite and choose viewing or editing access.
4. Have the invited person open the drawing from their shared workspace.
5. Open the same drawing at the same time to work together. Editing access allows collaborators to change the drawing; viewing access allows them to read it.

<ThemeScreenshot light="/images/screenshots/share-drawing-light.png" dark="/images/screenshots/share-drawing.png" alt="Share dialog open with account search and access controls" />

Live cursors and presence help you see who is working on the drawing.

<ThemeScreenshot light="/images/collaboration-light.png" dark="/images/collaboration-dark.png" alt="Live deployment drawing with collaborator avatars and named cursors" />

## Share collections

Collections group related drawings. Right-click a collection in the sidebar and select **Share Collection**. Share the collection with other accounts and select their access level to work on a set of drawings together. Keep access scoped to the people who need it.

<ThemeScreenshot light="/images/screenshots/share-collection-light.png" dark="/images/screenshots/share-collection.png" alt="Share Collection dialog open for Platform engineering" />

## Share a link

In the drawing's **Share** controls, open **Link access** to choose **Restricted** or **Anyone with the link**. Choose viewing or editing permission and an expiration when available, then copy the link. Anyone who receives an enabled link can use the access it grants, subject to your instance's sharing policy. Revoke the link when that access is no longer needed.

<ThemeScreenshot light="/images/screenshots/share-link-light.png" dark="/images/screenshots/share-link.png" alt="Drawing Share dialog with Link access choices open" />

## Configure your reverse proxy

For HTTPS deployments, your proxy must forward WebSocket upgrades for `/socket.io/`. Set `FRONTEND_URL` to the origin people use to open your workspace, and configure `TRUST_PROXY` for your trusted proxy chain. Follow the [HTTPS deployment instructions](/deploy/docker#configure-https).

## Troubleshoot live editing

If the drawing loads but edits do not appear in the second session:

- Confirm both people opened the same drawing and have the intended permissions.
- Confirm the reverse proxy forwards WebSocket upgrades.
- Check that `FRONTEND_URL` matches the deployed URL, including HTTPS.
- Read the backend logs for connection or authorization errors:

```bash
docker compose -f docker-compose.prod.yml logs --tail=100 backend
```

Collaboration and backups serve different purposes. Use [persistent storage and separate backups](/guide/storage-backups) to protect the workspace over time.
