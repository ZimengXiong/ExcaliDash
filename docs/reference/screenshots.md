---
title: Screenshots
description: Light and dark mode screenshots of the ExcaliDash dashboard, collections, Excalidraw editor, live collaboration, sharing, history, and settings.
---

<script setup>
import { setupSlides, passwordResetSlides } from "../.vitepress/theme/screenshot-flows";
</script>

# Screenshots

Click any screenshot to open the full-resolution image. Every image automatically follows this site's light or dark theme—toggle the theme switch in the top bar to compare both.

## Dashboard and collections

### All drawings

Browse saved canvases as visual cards, filter by collection, sort, and search across your workspace.

<ThemeScreenshot light="/images/workspace-light.png" dark="/images/workspace.png" alt="ExcaliDash dashboard showing drawing previews, collections, and search" />

### Platform engineering collection

Group infrastructure and deployment diagrams in one collection.

<ThemeScreenshot light="/images/screenshots/platform-engineering-light.png" dark="/images/screenshots/platform-engineering.png" alt="Platform engineering collection view" />

### Interface design collection

Keep wireframes and UI flows organized together.

<ThemeScreenshot light="/images/screenshots/interface-design-light.png" dark="/images/screenshots/interface-design.png" alt="Interface design collection view" />

### Data and observability collection

Collect pipeline diagrams, telemetry sketches, and architecture notes.

<ThemeScreenshot light="/images/screenshots/data-observability-light.png" dark="/images/screenshots/data-observability.png" alt="Data and observability collection view" />

## Editor and responsive views

### Deployment diagram editor

Full Excalidraw canvas with auto-save, sharing, and version history in the top bar.

<ThemeScreenshot light="/images/screenshots/deployment-editor-light.png" dark="/images/screenshots/deployment-editor.png" alt="Deployment diagram open in the Excalidraw editor" />

### Pipeline diagram editor

Large multi-stage architecture diagrams fit cleanly into the viewport on open.

<ThemeScreenshot light="/images/screenshots/pipeline-editor-light.png" dark="/images/screenshots/pipeline-editor.png" alt="Pipeline diagram open in the Excalidraw editor" />

### Tablet workspace

Responsive grid and sidebar layout on tablet screens.

<ThemeScreenshot light="/images/screenshots/tablet-workspace-light.png" dark="/images/screenshots/tablet-workspace.png" alt="ExcaliDash dashboard on a tablet screen" width="1024" height="1100" />

### Mobile workspace

Compact mobile dashboard for browsing and opening drawings on the go.

<ThemeScreenshot light="/images/screenshots/mobile-workspace-light.png" dark="/images/screenshots/mobile-workspace.png" alt="ExcaliDash dashboard on a mobile screen" width="430" height="932" />

## Collaboration and sharing

### Live deployment review

Named collaborator cursors and presence avatars during an active session.

<ThemeScreenshot light="/images/collaboration-light.png" dark="/images/collaboration-dark.png" alt="Live deployment review with collaborator avatars and named cursors" />

### Live pipeline workshop

Multiple editors working across a larger pipeline diagram simultaneously.

<ThemeScreenshot light="/images/screenshots/live-pipeline-workshop-light.png" dark="/images/screenshots/live-pipeline-workshop.png" alt="Live collaborative pipeline workshop" />

### Drawing sharing

Invite local accounts with viewing or editing permissions directly from the editor.

<ThemeScreenshot light="/images/screenshots/share-drawing-light.png" dark="/images/screenshots/share-drawing.png" alt="Drawing Share dialog with account search and access levels" />

### Collection sharing

Share an entire collection from the sidebar context menu.

<ThemeScreenshot light="/images/screenshots/share-collection-light.png" dark="/images/screenshots/share-collection.png" alt="Share Collection dialog for Platform engineering" />

### Link access

Toggle between restricted access and link sharing with view/edit permissions.

<ThemeScreenshot light="/images/screenshots/share-link-light.png" dark="/images/screenshots/share-link.png" alt="Link access selector inside the Share dialog" />

### Version history

Preview automatic snapshots and restore any previous version.

<ThemeScreenshot light="/images/screenshots/drawing-history-light.png" dark="/images/screenshots/drawing-history.png" alt="Version history panel with snapshot preview and restore controls" />

## Setup, accounts, and settings

### Fresh-instance setup

Complete first-run flow from enabling authentication to opening the first canvas.

<ScreenshotCarousel label="Complete fresh-instance setup" :slides="setupSlides" />

### Create an account

Self-registration form when open sign-up is enabled by an administrator.

<ThemeScreenshot light="/images/screenshots/registration-light.png" dark="/images/screenshots/registration.png" alt="Local account registration form" />

### Sign in

Email and password sign-in screen.

<ThemeScreenshot light="/images/screenshots/signin-light.png" dark="/images/screenshots/signin.png" alt="Local sign-in page" />

### Password reset

End-to-end password reset flow when email delivery is configured.

<ScreenshotCarousel label="Password reset walkthrough" :slides="passwordResetSlides" />

### Admin controls

Manage self-registration and user accounts.

<ThemeScreenshot light="/images/screenshots/admin-light.png" dark="/images/screenshots/admin.png" alt="Admin panel with registration toggle and user list" />

### Create a user

Add local accounts directly from the Admin panel.

<ThemeScreenshot light="/images/screenshots/new-user-light.png" dark="/images/screenshots/new-user.png" alt="New User creation modal" />

### Workspace settings

Configure language, appearance (`Light` / `Dark` / `System`), editor behavior, image optimization, and backup exports.

<ThemeScreenshot light="/images/screenshots/settings-light.png" dark="/images/screenshots/settings.png" alt="Workspace settings page" />

### Advanced settings

Expand **Advanced** to import `.excalidash` backups and inspect instance details.

<ThemeScreenshot light="/images/screenshots/advanced-settings-light.png" dark="/images/screenshots/advanced-settings.png" alt="Advanced settings with backup import controls" />

### Backup import confirmation

Review drawing, collection, and image counts before confirming an import.

<ThemeScreenshot light="/images/screenshots/import-backup-light.png" dark="/images/screenshots/import-backup.png" alt="Backup import confirmation modal" />

[Sample drawing credits and licenses](/images/CREDITS.txt).
