#!/bin/sh
set -e

# Auto-hydrate prisma directory when bind-mounted volume is empty
if [ ! -f "/app/prisma/schema.prisma" ]; then
	echo "Mount is empty. Hydrating /app/prisma from /app/prisma_template..."
	cp -R /app/prisma_template/. /app/prisma/
fi

# Ensure proper ownership and permissions for data directories
echo "Setting up data directory permissions..."
mkdir -p /app/uploads
mkdir -p /app/prisma

# Set ownership to the node user (UID 1000)
if [ "$(id -u)" = "0" ]; then
	# If running as root (for some reason), fix ownership
	chown -R nodejs:nodejs /app/uploads
	chown -R nodejs:nodejs /app/prisma
fi

# Ensure database file has proper permissions
if [ -f "/app/prisma/dev.db" ]; then
	chmod 664 /app/prisma/dev.db 2>/dev/null || true
fi

# Set appropriate permissions for uploads directory
chmod 755 /app/uploads

# Run migrations as the current user
echo "Running database migrations..."
npx prisma migrate deploy

# Start the application
echo "Starting application as user $(whoami) (UID: $(id -u))"
node dist/index.js
