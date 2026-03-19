#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="excalidash-db"
BACKUP_DIR="${BACKUP_DIR:-$(cd "$(dirname "$0")/.." && pwd)/backups}"
DB_USER="${POSTGRES_USER:-excalidash}"
DB_NAME="${POSTGRES_DB:-excalidash}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DAY_OF_WEEK=$(date +%u)

mkdir -p "$BACKUP_DIR"

BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"
docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"
echo "Backup: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Weekly snapshot on Sundays
if [ "$DAY_OF_WEEK" -eq 7 ]; then
  cp "$BACKUP_FILE" "$BACKUP_DIR/${DB_NAME}_weekly_${TIMESTAMP}.sql.gz"
fi

# Retention: 7 days daily, 28 days weekly
find "$BACKUP_DIR" -name "${DB_NAME}_2*.sql.gz" -mtime +7 -delete
find "$BACKUP_DIR" -name "${DB_NAME}_weekly_*.sql.gz" -mtime +28 -delete
