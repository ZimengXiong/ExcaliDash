# Build from the repository root: docker build -f mcp/Dockerfile .
FROM node:24.22.1-alpine AS build
WORKDIR /app
COPY mcp/package.json mcp/package-lock.json mcp/tsconfig.json ./
RUN npm ci --no-audit --no-fund
COPY mcp/src ./src
RUN npm run build

FROM node:24.22.1-alpine AS runtime
ARG APP_BUILD_LABEL=local
LABEL org.opencontainers.image.source="https://github.com/brenovit/ExcaliDash" \
      org.opencontainers.image.licenses="MIT AND LGPL-3.0-only" \
      org.opencontainers.image.description="MCP server for ExcaliDash, based on LatikDesu/excalidash-mcp" \
      org.opencontainers.image.version="${APP_BUILD_LABEL}"
ENV NODE_ENV=production
WORKDIR /app
COPY mcp/package.json mcp/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist/index.js /app/dist/excalidash.js /app/dist/http.js /app/dist/operations.js /app/dist/scene.js ./dist/
COPY mcp/LICENSE ./LICENSE
COPY NOTICE ./NOTICE
USER node
CMD ["node", "dist/index.js"]
