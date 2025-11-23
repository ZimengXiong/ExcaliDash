# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy prisma schema
COPY prisma ./prisma/

# Generate Prisma Client
RUN npx prisma generate

# Copy source code
COPY src ./src

# Build TypeScript
RUN npx tsc

# Production stage
FROM node:20-alpine

# Install OpenSSL for Prisma and create non-root user
RUN apk add --no-cache openssl && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy prisma schema and migrations for runtime and hydration template
COPY prisma ./prisma/
COPY prisma ./prisma_template/

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy the generated Prisma Client from builder to maintain the same structure
COPY --from=builder /app/src/generated ./dist/generated

# Generate Prisma Client in production (updates node_modules)
RUN npx prisma generate

# Create necessary directories and set proper ownership
RUN mkdir -p /app/uploads /app/prisma && \
    chown -R nodejs:nodejs /app

# Copy and set permissions for entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && \
    chown nodejs:nodejs docker-entrypoint.sh

# Switch to non-root user
USER nodejs

EXPOSE 8000

ENTRYPOINT ["./docker-entrypoint.sh"]
