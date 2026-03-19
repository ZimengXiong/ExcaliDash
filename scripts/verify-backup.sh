#!/usr/bin/env bash
set -euo pipefail

# Verify the latest backup is restorable by restoring into a temporary container.
# Exit 0 = backup verified, non-zero = problem.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"

VERIFY_CONTAINER="excalidash-verify-$$"
VERIFY_PORT=5433
DB_USER="${POSTGRES_USER:-excalidash}"
DB_NAME="${POSTGRES_DB:-excalidash}"

EXPECTED_TABLES=(
  "User" "SystemConfig" "Collection" "Drawing" "DrawingPermission"
  "DrawingLinkShare" "Library" "PasswordResetToken" "RefreshToken"
  "AuditLog" "AuthIdentity" "_prisma_migrations"
)

cleanup() {
  echo "Cleaning up verification container..."
  docker rm -f "$VERIFY_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Find latest backup
LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/*.sql.gz 2>/dev/null | head -1)
if [ -z "$LATEST_BACKUP" ]; then
  echo "FAIL: No .sql.gz backups found in $BACKUP_DIR"
  exit 1
fi

echo "=== Backup Restore Verification ==="
echo "Backup: $(basename "$LATEST_BACKUP")"
echo "Size:   $(du -h "$LATEST_BACKUP" | cut -f1)"
echo "Date:   $(stat -f '%Sm' -t '%Y-%m-%d %H:%M' "$LATEST_BACKUP" 2>/dev/null || stat -c '%y' "$LATEST_BACKUP" 2>/dev/null | cut -d. -f1)"
echo ""

# Start temporary PostgreSQL container
echo "Starting temporary PostgreSQL on port $VERIFY_PORT..."
docker run -d --name "$VERIFY_CONTAINER" \
  -e POSTGRES_USER="$DB_USER" \
  -e POSTGRES_PASSWORD="$(openssl rand -hex 16)" \
  -e POSTGRES_DB="$DB_NAME" \
  -p "$VERIFY_PORT:5432" \
  postgres:17-alpine >/dev/null

# Wait for PostgreSQL to be ready
echo -n "Waiting for PostgreSQL..."
for i in $(seq 1 30); do
  if docker exec "$VERIFY_CONTAINER" pg_isready -U "$DB_USER" >/dev/null 2>&1; then
    echo " ready (${i}s)"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo " TIMEOUT"
    echo "FAIL: Temporary PostgreSQL did not start within 30s"
    exit 1
  fi
  sleep 1
done

# Restore backup
echo "Restoring backup..."
if ! gunzip -c "$LATEST_BACKUP" | docker exec -i "$VERIFY_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -q 2>&1 | tail -5; then
  echo "FAIL: Restore command failed"
  exit 1
fi
echo ""

# Verify tables exist and have data
echo "=== Table Verification ==="
MISSING=0
EMPTY_WARN=0

printf "%-25s %s\n" "TABLE" "ROWS"
printf "%-25s %s\n" "-------------------------" "--------"

for TABLE in "${EXPECTED_TABLES[@]}"; do
  ROW_COUNT=$(docker exec "$VERIFY_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A \
    -c "SELECT COUNT(*) FROM \"$TABLE\";" 2>/dev/null) || {
    printf "%-25s %s\n" "$TABLE" "MISSING"
    MISSING=$((MISSING + 1))
    continue
  }
  ROW_COUNT=$(echo "$ROW_COUNT" | tr -d '[:space:]')
  if [ "$ROW_COUNT" = "0" ] && [ "$TABLE" != "PasswordResetToken" ] && [ "$TABLE" != "DrawingPermission" ] && [ "$TABLE" != "DrawingLinkShare" ] && [ "$TABLE" != "AuthIdentity" ]; then
    printf "%-25s %s (warn: empty)\n" "$TABLE" "$ROW_COUNT"
    EMPTY_WARN=$((EMPTY_WARN + 1))
  else
    printf "%-25s %s\n" "$TABLE" "$ROW_COUNT"
  fi
done

echo ""

# Coherence check: _prisma_migrations should have entries
MIGRATION_COUNT=$(docker exec "$VERIFY_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A \
  -c "SELECT COUNT(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL;" 2>/dev/null | tr -d '[:space:]')

if [ "$MISSING" -gt 0 ]; then
  echo "FAIL: $MISSING table(s) missing from backup"
  exit 1
fi

if [ "${MIGRATION_COUNT:-0}" = "0" ]; then
  echo "FAIL: No completed migrations found (schema may be corrupt)"
  exit 1
fi

echo "Migrations: $MIGRATION_COUNT completed"

if [ "$EMPTY_WARN" -gt 0 ]; then
  echo "WARN: $EMPTY_WARN core table(s) are empty (may be expected for fresh installs)"
fi

echo ""
echo "PASS: Backup verified successfully"
echo "  File: $(basename "$LATEST_BACKUP")"
echo "  Tables: ${#EXPECTED_TABLES[@]} found, $MISSING missing"
echo "  Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
