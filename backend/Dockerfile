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

# Set default provider for build-time Prisma generation (runtime can override via DATABASE_PROVIDER)
RUN sed -i '/datasource db {/,/}/ s/provider = env("[^"]*")/provider = "sqlite"/; /datasource db {/,/}/ s/provider = "[^"]*"/provider = "sqlite"/' prisma/schema.prisma

# Generate Prisma Client at build time (for TypeScript compilation)
# Runtime will regenerate if DATABASE_PROVIDER differs
RUN npx prisma generate

# Copy source code
COPY src ./src

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

# Copy the generated Prisma Client from builder (will be regenerated at runtime if provider changes)
COPY --from=builder /app/src/generated ./dist/generated

# Create necessary directories (ownership will be set in entrypoint)
RUN mkdir -p /app/uploads /app/prisma

# Copy and set permissions for entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# REMOVED: USER nodejs (We must stay root to fix permissions in entrypoint)

EXPOSE 8000

ENTRYPOINT ["./docker-entrypoint.sh"]
