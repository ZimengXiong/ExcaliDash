#!/bin/sh
# Builds the Excalidraw packages from the 8gears/excalidraw-animate fork and
# packs them into frontend/vendor/excalidraw-animate/, where frontend/package.json
# picks them up as file: dependencies. Run it before `npm ci` in frontend/.
#
#   EXCALIDRAW_ANIMATE_REF  commit of 8gears/excalidraw-animate to build
#   OUT_DIR                 where the .tgz files go
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${EXCALIDRAW_ANIMATE_REPO:-https://github.com/8gears/excalidraw-animate.git}"
REF="${EXCALIDRAW_ANIMATE_REF:-d9ab7a8463306104997d63df46a8a7889d0cd58f}"
OUT_DIR="${OUT_DIR:-$ROOT/frontend/vendor/excalidraw-animate}"
PATCH="$ROOT/patches/excalidraw-animate-exports.patch"
WORK="${WORK_DIR:-$(mktemp -d)}"

if command -v yarn >/dev/null 2>&1; then
  YARN="yarn"
else
  YARN="npx -y yarn@1.22.22"
fi

echo "[excalidraw-animate] building $REF in $WORK"
git init -q "$WORK/src"
cd "$WORK/src"
git remote add origin "$REPO"
git fetch -q --depth 1 origin "$REF"
git checkout -q FETCH_HEAD
git apply "$PATCH"

$YARN install --frozen-lockfile --network-timeout 600000
$YARN build:packages

mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR"/*.tgz
for pkg in common math fractional-indexing laser-pointer element excalidraw; do
  (cd "packages/$pkg" && npm pack --silent --pack-destination "$OUT_DIR" >/dev/null)
done
ls -l "$OUT_DIR"
