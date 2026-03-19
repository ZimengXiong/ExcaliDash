#!/bin/sh
set -e

RUN_MIGRATIONS="${RUN_MIGRATIONS:-true}"

# --- Secret management ---
# Generate JWT_SECRET if not provided
if [ -z "${JWT_SECRET:-}" ]; then
    echo "JWT_SECRET not provided. Generating an ephemeral secret..."
    JWT_SECRET="$(openssl rand -hex 32)"
fi
export JWT_SECRET

# Generate CSRF_SECRET if not provided
if [ -z "${CSRF_SECRET:-}" ]; then
    echo "CSRF_SECRET not provided. Generating an ephemeral secret..."
    CSRF_SECRET="$(openssl rand -base64 32)"
fi
export CSRF_SECRET

# --- Filesystem permissions (running as root) ---
echo "Fixing filesystem permissions..."
chown -R nodejs:nodejs /app/uploads
chmod 755 /app/uploads

# --- Wait for PostgreSQL ---
echo "Waiting for PostgreSQL..."
DB_URL="${DATABASE_URL}"
# Extract host:port from postgresql://user:pass@host:port/db
DB_HOST=$(echo "$DB_URL" | sed -n 's|.*@\([^:/]*\).*|\1|p')
DB_PORT=$(echo "$DB_URL" | sed -n 's|.*@[^:]*:\([0-9]*\).*|\1|p')
DB_PORT="${DB_PORT:-5432}"

attempts=0
max_attempts=30
until su-exec nodejs node -e "
  const net = require('net');
  const s = net.createConnection(${DB_PORT}, '${DB_HOST}');
  s.on('connect', () => { s.destroy(); process.exit(0); });
  s.on('error', () => process.exit(1));
" 2>/dev/null; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge "$max_attempts" ]; then
        echo "ERROR: PostgreSQL not reachable at ${DB_HOST}:${DB_PORT} after ${max_attempts} attempts"
        exit 1
    fi
    echo "PostgreSQL not ready (attempt ${attempts}/${max_attempts})..."
    sleep 2
done
echo "PostgreSQL is ready."

# --- Run migrations ---
if [ "${RUN_MIGRATIONS}" = "true" ] || [ "${RUN_MIGRATIONS}" = "1" ]; then
    echo "Running database migrations..."
    su-exec nodejs npx prisma migrate deploy
else
    echo "Skipping database migrations (RUN_MIGRATIONS=${RUN_MIGRATIONS})"
fi

# --- Start application (drop privileges) ---
echo "Starting application as nodejs..."
exec su-exec nodejs node dist/index.js
