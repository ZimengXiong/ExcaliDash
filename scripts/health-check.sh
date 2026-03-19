#!/usr/bin/env bash
set -euo pipefail

# Health check for ExcaliDash: checks public endpoint (full chain) and local endpoint.
# Alerts on state transitions only to avoid spam.

PUBLIC_URL="${HEALTH_CHECK_PUBLIC_URL:-}"
LOCAL_URL="${HEALTH_CHECK_LOCAL_URL:-http://localhost:6767}"
TIMEOUT=10

STATE_DIR="$HOME/.excalidash-monitor"
STATE_FILE="$STATE_DIR/last_status"
LOG_FILE="$STATE_DIR/health.log"
MAX_LOG_LINES=1000

mkdir -p "$STATE_DIR"

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
PREV_STATUS=$(cat "$STATE_FILE" 2>/dev/null || echo "unknown")

# Check public endpoint (DNS -> Cloudflare -> tunnel -> frontend -> backend)
PUBLIC_OK=false
if [ -n "$PUBLIC_URL" ]; then
  if curl -sf --max-time "$TIMEOUT" -o /dev/null "$PUBLIC_URL" 2>/dev/null; then
    PUBLIC_OK=true
  fi
else
  PUBLIC_OK=true  # Skip public check if not configured
fi

# Check local endpoint (bypass Cloudflare)
LOCAL_OK=false
if curl -sf --max-time "$TIMEOUT" -o /dev/null "$LOCAL_URL" 2>/dev/null; then
  LOCAL_OK=true
fi

# Determine status
if $PUBLIC_OK && $LOCAL_OK; then
  STATUS="healthy"
elif ! $PUBLIC_OK && $LOCAL_OK; then
  STATUS="tunnel_down"
elif ! $PUBLIC_OK && ! $LOCAL_OK; then
  STATUS="down"
else
  STATUS="partial"
fi

# Log entry
LOG_ENTRY="[$TIMESTAMP] status=$STATUS public=$PUBLIC_OK local=$LOCAL_OK"
echo "$LOG_ENTRY" >> "$LOG_FILE"

# Rotate log
if [ "$(wc -l < "$LOG_FILE")" -gt "$MAX_LOG_LINES" ]; then
  tail -n "$MAX_LOG_LINES" "$LOG_FILE" > "$LOG_FILE.tmp"
  mv "$LOG_FILE.tmp" "$LOG_FILE"
fi

# Display status
case "$STATUS" in
  healthy)     echo "$TIMESTAMP  OK  public=up local=up" ;;
  tunnel_down) echo "$TIMESTAMP  WARN  public=DOWN local=up (tunnel issue)" ;;
  down)        echo "$TIMESTAMP  CRIT  public=DOWN local=DOWN" ;;
  partial)     echo "$TIMESTAMP  WARN  public=up local=DOWN (unexpected)" ;;
esac

# Alert on state transitions only
if [ "$STATUS" != "$PREV_STATUS" ]; then
  case "$STATUS" in
    healthy)
      if [ "$PREV_STATUS" != "unknown" ]; then
        osascript -e "display notification \"Service recovered (was: $PREV_STATUS)\" with title \"ExcaliDash\" subtitle \"Status: Healthy\"" 2>/dev/null || true
      fi
      ;;
    tunnel_down)
      osascript -e "display notification \"Public endpoint unreachable. Local is OK — likely Cloudflare tunnel issue.\" with title \"ExcaliDash\" subtitle \"Tunnel Down\"" 2>/dev/null || true
      ;;
    down)
      osascript -e "display notification \"Both public and local endpoints are down!\" with title \"ExcaliDash\" subtitle \"Service Down\"" 2>/dev/null || true
      ;;
    partial)
      osascript -e "display notification \"Public OK but local endpoint down (unexpected state)\" with title \"ExcaliDash\" subtitle \"Partial Outage\"" 2>/dev/null || true
      ;;
  esac
fi

# Persist current status
echo "$STATUS" > "$STATE_FILE"
