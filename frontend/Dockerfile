# Build stage
FROM node:20-alpine AS builder

WORKDIR /app/frontend

# Copy package files first for better caching
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci

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
FROM nginx:alpine

# Install envsubst (gettext) so we can template nginx config at runtime
RUN apk add --no-cache gettext

# Copy nginx config template (will be processed at runtime)
COPY frontend/nginx.conf.template /etc/nginx/nginx.conf.template
# Also copy the original as fallback
COPY frontend/nginx.conf /etc/nginx/nginx.conf

# Copy entrypoint script
COPY frontend/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Copy built application from builder
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

# Use custom entrypoint to process nginx config template
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
