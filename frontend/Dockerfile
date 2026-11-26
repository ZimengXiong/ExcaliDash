# Excalidraw with the animation panel: builds the 8gears/excalidraw-animate
# packages that frontend/package.json consumes as file: dependencies.
# Output is plain JS, so this stage always runs on the build machine's arch.
FROM --platform=$BUILDPLATFORM node:24.22.1 AS excalidraw-animate

WORKDIR /build
COPY scripts/build-excalidraw-animate.sh scripts/
COPY patches/excalidraw-animate-exports.patch patches/
ARG EXCALIDRAW_ANIMATE_REF
RUN OUT_DIR=/out WORK_DIR=/tmp/excalidraw-animate sh scripts/build-excalidraw-animate.sh

# Build stage
FROM node:24.22.1-alpine AS builder

WORKDIR /app/frontend

# Copy package files first for better caching
COPY frontend/package*.json ./
COPY --from=excalidraw-animate /out/ ./vendor/excalidraw-animate/

# Install dependencies
RUN npm ci && npm cache clean --force

# Copy source code and config files
COPY frontend/ ./
COPY VERSION ../VERSION

# Build arguments
ARG VITE_APP_BUILD_LABEL
ENV VITE_APP_BUILD_LABEL=$VITE_APP_BUILD_LABEL

# Build the application
RUN npm run build

# Production stage
FROM nginxinc/nginx-unprivileged:alpine

# Apply Alpine security fixes that may postdate the nginx base image.
USER root
RUN apk upgrade --no-cache
USER nginx

# Copy nginx config template (will be processed at runtime)
COPY --chown=nginx:nginx --chmod=0444 frontend/nginx.conf.template /etc/nginx/nginx.conf.template

# Copy entrypoint script
COPY --chown=nginx:nginx --chmod=0555 frontend/docker-entrypoint.sh /docker-entrypoint.sh

# Copy built application from builder
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 80 8080

# Use custom entrypoint to process nginx config template
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-c", "/tmp/nginx.conf", "-g", "daemon off;"]
