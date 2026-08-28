# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Native build deps for modules that may compile from source (e.g., better-sqlite3 on arm64)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci && npm cache clean --force

# Copy prisma schema
COPY prisma ./prisma/

# Pre-generate a Prisma Client for every supported provider. Generating here rather
# than in the entrypoint keeps the runtime offline: `prisma generate` downloads any
# engine listed in binaryTargets that npm install did not already fetch, which makes
# the container unstartable in air-gapped environments.
RUN cp prisma/schema.prisma /tmp/schema.prisma.orig && \
    for provider in sqlite postgresql; do \
        cp /tmp/schema.prisma.orig prisma/schema.prisma && \
        sed -i '/datasource db {/,/}/ s/provider = env("[^"]*")/provider = "'"$provider"'"/; /datasource db {/,/}/ s/provider = "[^"]*"/provider = "'"$provider"'"/' prisma/schema.prisma && \
        npx prisma generate && \
        mv src/generated /app/prisma_client_"$provider"; \
    done && \
    cp /tmp/schema.prisma.orig prisma/schema.prisma && \
    rm /tmp/schema.prisma.orig

# Copy source code
COPY src ./src

# TypeScript needs a generated client to compile against; both providers emit the
# same types, so either one works here.
RUN rm -rf src/generated && cp -R /app/prisma_client_sqlite src/generated

# Build TypeScript
RUN npx tsc

# Production stage
FROM node:20-alpine

# Install runtime packages and create non-root user
RUN apk add --no-cache openssl su-exec && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN apk add --no-cache --virtual .build-deps python3 make g++ && \
    npm ci --omit=dev && \
    npm cache clean --force && \
    apk del .build-deps

# Copy prisma schema and migrations for runtime and hydration template
COPY prisma ./prisma/
COPY prisma ./prisma_template/

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy the Prisma Clients pre-generated for each supported provider. The entrypoint
# installs the one matching DATABASE_PROVIDER, so no generation happens at startup.
COPY --from=builder /app/prisma_client_sqlite ./prisma_client/sqlite
COPY --from=builder /app/prisma_client_postgresql ./prisma_client/postgresql

# Create necessary directories (ownership will be set in entrypoint)
RUN mkdir -p /app/uploads /app/prisma

# Copy and set permissions for entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# REMOVED: USER nodejs (We must stay root to fix permissions in entrypoint)

EXPOSE 8000

ENTRYPOINT ["./docker-entrypoint.sh"]
