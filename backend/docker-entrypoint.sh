#!/bin/sh
set -e

JWT_SECRET_FILE="/app/prisma/.jwt_secret"
CSRF_SECRET_FILE="/app/prisma/.csrf_secret"
MIGRATION_LOCK_DIR="/app/prisma/.migration-lock"
MIGRATION_LOCK_TIMEOUT_SECONDS="${MIGRATION_LOCK_TIMEOUT_SECONDS:-120}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-true}"

# Ensure JWT secret exists for production startup.
# Backward compatibility: older installs may not have JWT_SECRET configured.
if [ -z "${JWT_SECRET:-}" ]; then
    echo "JWT_SECRET not provided, resolving persisted secret..."
    if [ -f "${JWT_SECRET_FILE}" ]; then
        JWT_SECRET="$(tr -d '\r\n' < "${JWT_SECRET_FILE}")"
    fi

    if [ -z "${JWT_SECRET}" ]; then
        echo "No persisted JWT secret found. Generating a new secret..."
        JWT_SECRET="$(openssl rand -hex 32)"
        umask 077
        printf "%s" "${JWT_SECRET}" > "${JWT_SECRET_FILE}"
    fi
else
    # Persist explicitly provided secret to support future restarts without env injection.
    umask 077
    printf "%s" "${JWT_SECRET}" > "${JWT_SECRET_FILE}"
fi

export JWT_SECRET

# Ensure CSRF secret exists for stable token validation across restarts.
# (Still recommend setting explicitly for multi-instance deployments.)
if [ -z "${CSRF_SECRET:-}" ]; then
    echo "CSRF_SECRET not provided, resolving persisted secret..."
    if [ -f "${CSRF_SECRET_FILE}" ]; then
        CSRF_SECRET="$(tr -d '\r\n' < "${CSRF_SECRET_FILE}")"
    fi

    if [ -z "${CSRF_SECRET}" ]; then
        echo "No persisted CSRF secret found. Generating a new secret..."
        CSRF_SECRET="$(openssl rand -base64 32)"
        umask 077
        printf "%s" "${CSRF_SECRET}" > "${CSRF_SECRET_FILE}"
    fi
else
    umask 077
    printf "%s" "${CSRF_SECRET}" > "${CSRF_SECRET_FILE}"
fi

export CSRF_SECRET

# Set default DATABASE_PROVIDER if not set
if [ -z "${DATABASE_PROVIDER:-}" ]; then
    echo "DATABASE_PROVIDER not set, defaulting to sqlite"
    DATABASE_PROVIDER="sqlite"
fi

# Validate DATABASE_PROVIDER
if [ "${DATABASE_PROVIDER}" != "sqlite" ] && [ "${DATABASE_PROVIDER}" != "postgresql" ]; then
    echo "ERROR: DATABASE_PROVIDER must be 'sqlite' or 'postgresql', got '${DATABASE_PROVIDER}'"
    exit 1
fi

# Ensure migrations directory exists
mkdir -p /app/prisma/migrations

# Copy schema.prisma from template
cp /app/prisma_template/schema.prisma /app/prisma/schema.prisma

# Clear and copy provider-specific migrations folder
echo "Copying ${DATABASE_PROVIDER} migrations..."
rm -rf /app/prisma/migrations/*
cp -R /app/prisma_template/migrations/"${DATABASE_PROVIDER}"/. /app/prisma/migrations/

# Update schema.prisma with the runtime provider (handles both env() and static values)
echo "Configuring Prisma for provider: ${DATABASE_PROVIDER}"
sed -i '/datasource db {/,/}/ s/provider = env("[^"]*")/provider = "'"${DATABASE_PROVIDER}"'"/' /app/prisma/schema.prisma
sed -i '/datasource db {/,/}/ s/provider = "[^"]*"/provider = "'"${DATABASE_PROVIDER}"'"/' /app/prisma/schema.prisma

# Generate Prisma Client at runtime (run as root since schema is owned by root)
echo "Generating Prisma Client..."
npx prisma generate --schema=/app/prisma/schema.prisma

# Copy generated client to the expected location for the application
mkdir -p /app/dist/generated
cp -r /app/src/generated/* /app/dist/generated/

# 2. Fix permissions unconditionally (Running as root)
echo "Fixing filesystem permissions..."
chown -R nodejs:nodejs /app/uploads /app/prisma /app/dist/generated
chmod 755 /app/uploads
chmod -R 755 /app/dist/generated
chmod 600 "${JWT_SECRET_FILE}"
chmod 600 "${CSRF_SECRET_FILE}"

# Ensure database file has proper permissions
if [ -f "/app/prisma/dev.db" ]; then
    echo "Database file found, ensuring write permissions..."
    chmod 600 /app/prisma/dev.db
fi

# 3. Run Migrations (Drop privileges to nodejs)
# SQLite + multi-replica note:
# - Running migrations concurrently against the same SQLite file can fail.
# - This lock coordinates startup when multiple containers share the same volume.
# - For Kubernetes, the safest pattern is still: run migrations once via a Job/init container
#   and set RUN_MIGRATIONS=false on the main deployment.
if [ "${RUN_MIGRATIONS}" = "true" ] || [ "${RUN_MIGRATIONS}" = "1" ]; then
    echo "Running database migrations..."

    lock_waited=0
    while ! mkdir "${MIGRATION_LOCK_DIR}" 2>/dev/null; do
        if [ "${lock_waited}" -ge "${MIGRATION_LOCK_TIMEOUT_SECONDS}" ]; then
            echo "Timed out waiting for migration lock after ${MIGRATION_LOCK_TIMEOUT_SECONDS}s"
            exit 1
        fi
        lock_waited=$((lock_waited + 1))
        sleep 1
    done

    # Best-effort cleanup so future startups don't block forever.
    trap 'rmdir "${MIGRATION_LOCK_DIR}" 2>/dev/null || true' EXIT INT TERM

    su-exec nodejs npx prisma migrate deploy

    rmdir "${MIGRATION_LOCK_DIR}" 2>/dev/null || true
    trap - EXIT INT TERM
else
    echo "Skipping database migrations (RUN_MIGRATIONS=${RUN_MIGRATIONS})"
fi

# 4. Start Application (Drop privileges to nodejs)
echo "Starting application as nodejs..."
exec su-exec nodejs node dist/index.js
