#!/bin/bash
# Memory and save latency of one backend image under a burst of drawing saves.
# usage: bench.sh <image> <previews.json>
# env: SAVES (200), HEAP_MB (unset: image default), MEM_LIMIT (unset: no limit)
set -euo pipefail

image=$1
previews=$(cd "$(dirname "$2")" && pwd)/$(basename "$2")
here=$(cd "$(dirname "$0")" && pwd)
name=sanitizer-bench-$$
samples=$(mktemp)
log=$(mktemp)
trap 'docker rm -f "$name" "$name-load" >/dev/null 2>&1; rm -f "$samples" "$log"' EXIT

set -- -e DATABASE_URL=file:/app/prisma/dev.db -e AUTH_MODE=disabled -e NODE_ENV=production \
  -e FRONTEND_URL=http://localhost -e API_KEY_HASH_PEPPER="$(openssl rand -hex 32)"
[ -n "${HEAP_MB:-}" ] && set -- "$@" -e NODE_OPTIONS=--max-old-space-size="$HEAP_MB"
[ -n "${MEM_LIMIT:-}" ] && set -- "$@" --memory "$MEM_LIMIT"
docker run -d --name "$name" --network none "$@" "$image" >/dev/null

docker run --rm --name "$name-load" --network container:"$name" \
  -e SAVES="${SAVES:-200}" \
  -v "$here":/bench:ro -v "$previews":/previews.json:ro --entrypoint node \
  "$image" /bench/load.cjs /previews.json > "$log" 2>&1 &
load=$!

# epoch seconds, RssAnon of the backend process in kB, container memory as docker stats reports it
while kill -0 "$load" 2>/dev/null; do
  # the backend may still be starting: no process to read yet
  anon=$(docker exec "$name" sh -c 'grep RssAnon /proc/$(pidof node)/status 2>/dev/null' | awk '{print $2}' || true)
  mem=$(docker stats --no-stream --format '{{.MemUsage}}' "$name" | awk '{print $1}' || true)
  [ -n "$anon" ] && echo "$(date +%s) $anon $mem" >> "$samples"
  sleep 1
done
wait "$load" || { cat "$log"; exit 1; }
hwm=$(docker exec "$name" sh -c 'grep VmHWM /proc/$(pidof node)/status' | awk '{printf "%.0f MB", $2 / 1024}')

phase() { awk -v p="$1" '$1 == "PHASE" && $2 == p {print $3}' "$log"; }
# max and last RssAnon (MB) between two epoch seconds
stats() {
  awk -v from="$1" -v to="$2" '$1 >= from && $1 < to {
      a = $2 / 1024; if (a > max) max = a; last = a; n++ }
    END { if (n) printf "max %.0f MB, last %.0f MB", max, last; else printf "no samples (shorter than the sampling interval)" }' "$samples"
}
container_peak=$(awk '{ v = $3; n = v + 0;
    if (v ~ /GiB$/) n *= 1024; else if (v ~ /KiB$/) n /= 1024; else if (v ~ /[^i]B$/ && v !~ /MiB$/) n /= 1048576;
    if (n > max) max = n } END { printf "%.0f MB", max }' "$samples")

echo "image: $image"
echo "idle after start:  $(stats "$(phase idle)" "$(phase saves)")"
echo "during saves:      $(stats "$(phase saves)" "$(phase after)")"
echo "after saves:       $(stats "$(phase after)" "$(phase done)")"
echo "peak RSS:          $hwm (VmHWM, includes file-backed pages)"
echo "container peak:    $container_peak (docker stats)"
awk '$1 == "SAVES" {printf "saves (ms):        median %s, p95 %s, total %s\n", $3, $5, $7}' "$log"
