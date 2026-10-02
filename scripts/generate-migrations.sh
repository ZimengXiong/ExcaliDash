#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
MIGRATIONS_DIR="${PROJECT_DIR}/backend/prisma/migrations"
PRISMA_HELPER="${PROJECT_DIR}/backend/scripts/provider-prisma.cjs"

echo "=== ExcaliDash Migration Generator ==="
echo ""
echo "Select database provider:"
echo "1) SQLite"
echo "2) PostgreSQL"
echo ""
read -r -p "Enter choice (1 or 2): " choice

case "$choice" in
    1)
        PROVIDER="sqlite"
        ;;
    2)
        PROVIDER="postgresql"
        ;;
    *)
        echo "Invalid choice. Exiting."
        exit 1
        ;;
esac

PROVIDER_MIGRATIONS_DIR="${MIGRATIONS_DIR}/${PROVIDER}"

if [ ! -d "${PROVIDER_MIGRATIONS_DIR}" ]; then
    echo "ERROR: Migrations folder for '${PROVIDER}' does not exist at ${PROVIDER_MIGRATIONS_DIR}"
    exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
    echo ""
    echo "DATABASE_URL is not set. Please enter your database URL:"
    echo "Examples:"
    echo "  SQLite:      file:./dev.db"
    echo "  PostgreSQL:  postgresql://user:password@localhost:5432/excalidash"
    read -r -p "DATABASE_URL: " DATABASE_URL
    export DATABASE_URL
fi

export DATABASE_PROVIDER="${PROVIDER}"

echo ""
echo "Provider selected: ${PROVIDER}"
echo "Using provider migrations from: ${PROVIDER_MIGRATIONS_DIR}"
echo ""

cd "${PROJECT_DIR}/backend"

if [ "${1:-}" = "--dev" ]; then
    MIGRATION_NAME="${2:-new_migration}"
    echo "Running provider-scoped Prisma migrate dev --name ${MIGRATION_NAME}"
    node "${PRISMA_HELPER}" --persist-provider-migrations migrate dev --name "${MIGRATION_NAME}"
else
    echo "Running provider-scoped Prisma migrate deploy"
    node "${PRISMA_HELPER}" migrate deploy
fi

echo ""
echo "=== Done! ==="
echo ""
echo "Provider migrations are in: ${PROVIDER_MIGRATIONS_DIR}/"
ls -la "${PROVIDER_MIGRATIONS_DIR}/"
