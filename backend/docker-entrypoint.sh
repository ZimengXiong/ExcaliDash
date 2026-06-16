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

# Check that only one of OIDC_CLIENT_SECRET and OIDC_CLIENT_SECRET_FILE is set
if [ -n "${OIDC_CLIENT_SECRET}" ] && [ -f "${OIDC_CLIENT_SECRET_FILE}" ]; then
    echo "ERROR: Both OIDC_CLIENT_SECRET and OIDC_CLIENT_SECRET_FILE are set. Use only one." >&2
    exit 1
fi

# Read OIDC_CLIENT_SECRET if it is passed inside a file as OIDC_CLIENT_SECRET_FILE
if [ -f "${OIDC_CLIENT_SECRET_FILE}" ]; then
    OIDC_CLIENT_SECRET="$(tr -d '\r\n' < "${OIDC_CLIENT_SECRET_FILE}")"
fi
export OIDC_CLIENT_SECRET

# 1. Ensure schema and migrations are present (Running as root)
# Never copy the entire prisma directory, as that can unintentionally overwrite
# persisted SQLite files or copy stray *.db artifacts into the volume.
if [ ! -f "/app/prisma/schema.prisma" ]; then
    echo "Mount appears empty (missing schema.prisma). Bootstrapping schema and migrations..."
else
    # Volume exists but may be missing new migrations from an upgrade.
    echo "Syncing schema and migrations from template..."
fi

mkdir -p /app/prisma/migrations
cp /app/prisma_template/schema.prisma /app/prisma/schema.prisma
cp -R /app/prisma_template/migrations/. /app/prisma/migrations/

# 2. Fix permissions unconditionally (Running as root)
echo "Fixing filesystem permissions..."
chown -R nodejs:nodejs /app/uploads
chown -R nodejs:nodejs /app/prisma
chmod 755 /app/uploads
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
