# excalidash-improvements

Fork of [ZimengXiong/ExcaliDash](https://github.com/ZimengXiong/ExcaliDash) that swaps the stock Excalidraw editor for [8gears/excalidraw-animate](https://github.com/8gears/excalidraw-animate), adding an **Animate** panel (flow, draw, pulse, moving dots) and animated SVG export.

## What differs from upstream

| Path | Change |
| --- | --- |
| `scripts/build-excalidraw-animate.sh` | Clones the 8gears fork at a pinned commit, applies the patch below, builds its packages and packs them into `frontend/vendor/excalidraw-animate/` |
| `patches/excalidraw-animate-exports.patch` | Exports the animation UI from `@excalidraw/excalidraw`, and the label modules from `@excalidraw/element` (the 8gears fork only ships them to its own app) |
| `frontend/package.json` | `@excalidraw/*` come from the packed tarballs instead of npm |
| `frontend/src/pages/editor/EditorView.tsx` | Renders `<AnimationSidebar />` and its trigger, passes `onDuplicate`; `excalidrawAPI` prop renamed to `onExcalidrawAPI` (API of the newer Excalidraw) |
| `frontend/Dockerfile` | Extra first stage that runs the build script |

The backend is untouched: animation settings live in each element's `customData`, which the stock backend already stores.

## Build

```bash
# image (cluster nodes are amd64)
docker buildx build --platform linux/amd64 -f frontend/Dockerfile \
  -t <registry>/excalidash/frontend:<tag> --push .

# local development
scripts/build-excalidraw-animate.sh        # once, and after changing the pinned commit
cd frontend && npm ci && npm run dev
```

The tarballs are git-ignored and rebuilt on every image build, so `package-lock.json` carries no integrity hash for them.

## Updating

- **New ExcaliDash release:** rebase this branch onto the new tag. Conflicts are limited to the files in the table.
- **New 8gears commit:** change `EXCALIDRAW_ANIMATE_REF` in the script (or pass it as a build arg), rebuild, and run `npm install` in `frontend/` if its dependencies changed.
