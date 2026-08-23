# Build stage
FROM node:20-alpine AS builder

WORKDIR /app/frontend

# Copy package files first for better caching
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci && npm cache clean --force

# Copy source code and config files
COPY frontend/ ./
COPY VERSION ../VERSION

# Build arguments
ARG VITE_APP_VERSION
ARG VITE_APP_BUILD_LABEL
ENV VITE_APP_VERSION=$VITE_APP_VERSION
ENV VITE_APP_BUILD_LABEL=$VITE_APP_BUILD_LABEL

# Build the application
RUN npm run build

# Production stage
FROM nginxinc/nginx-unprivileged:alpine

# Copy nginx config template (will be processed at runtime)
COPY --chown=nginx:nginx frontend/nginx.conf.template /etc/nginx/nginx.conf.template

# Copy entrypoint script
COPY --chown=nginx:nginx frontend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Copy built application from builder
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 8080

# Use custom entrypoint to process nginx config template
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-c", "/tmp/nginx.conf", "-g", "daemon off;"]
