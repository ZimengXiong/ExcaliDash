# ExcaliDash 0.6.0

Release date: 2026-08-23

## Changes

- Drawing saves now reconcile version conflicts. Saves without an explicit version retry twice, pending work is sent when the page closes, and the editor shows “Unsaved changes” after repeated save failures.
- Drawing images are stored separately from scene JSON!! The editor uploads each file through the drawing-file endpoint, reloads missing files when a drawing opens, and avoids sending credentials to redirected external file URLs.
- Theme, language, dashboard sort order, image compression, editor auto-hide, and grid step are now stored as user preferences.
- The editor menu includes a grid-step selector. Mouse-wheel zoom and image-file dropping are handled inside the editor canvas.
- Recipients can hide a drawing from “Shared with me.”
- Socket permission checks now disconnect only the connection whose access check fails.
- AI drawing tools (fully optional & disableable!!) are available for early testing on `alpha` branch and are planned for the next release.
