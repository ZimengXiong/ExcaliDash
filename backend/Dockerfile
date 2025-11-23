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

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

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

# Run migrations and start server
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["./docker-entrypoint.sh"]
