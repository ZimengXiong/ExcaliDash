#!/bin/sh
set -e

# Auto-hydrate prisma directory when bind-mounted volume is empty
if [ ! -f "/app/prisma/schema.prisma" ]; then
	echo "Mount is empty. Hydrating /app/prisma from /app/prisma_template..."
	cp -R /app/prisma_template/. /app/prisma/
fi

# Run migrations
npx prisma migrate deploy

# Start the application
node dist/index.js
