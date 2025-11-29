#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Script accepts a suffix as argument (required)
SUFFIX=$1

if [ -z "$SUFFIX" ]; then
    echo -e "${RED}ERROR: Suffix is required!${NC}"
    echo -e "${YELLOW}Usage: ./publish-docker-alpha.sh <suffix>${NC}"
    echo -e "${YELLOW}Example: ./publish-docker-alpha.sh alpha-private-drawings${NC}"
    exit 1
fi

# No branch validation - can run from any branch
echo -e "${MAGENTA}===========================================${NC}"
echo -e "${MAGENTA}ExcaliDash Alpha/Dev Docker Builder${NC}"
echo -e "${MAGENTA}===========================================${NC}"
echo ""

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo -e "${YELLOW}Current branch: ${CURRENT_BRANCH}${NC}"
echo ""

# Configuration
DOCKER_USERNAME="zimengxiong"
IMAGE_NAME="excalidash"
BASE_VERSION=$(node -e "try { console.log(require('fs').readFileSync('VERSION', 'utf8').trim()) } catch { console.log('0.0.0') }")
VERSION="${BASE_VERSION}-dev-${SUFFIX}"

echo -e "${YELLOW}Base version: ${BASE_VERSION}${NC}"
echo -e "${YELLOW}Full tag: ${VERSION}${NC}"
echo ""
echo -e "${YELLOW}This will publish images with tag: ${VERSION}${NC}"
echo -e "${YELLOW}Alpha images will NOT update 'latest' or 'dev' tags${NC}"
echo ""

# Confirm before proceeding
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Aborted.${NC}"
    exit 1
fi

# Check if logged in to Docker Hub
echo -e "${YELLOW}Checking Docker Hub authentication...${NC}"
if ! docker info | grep -q "Username: $DOCKER_USERNAME"; then
    echo -e "${YELLOW}Not logged in. Please login to Docker Hub:${NC}"
    docker login
else
    echo -e "${GREEN}✓ Already logged in as $DOCKER_USERNAME${NC}"
fi

# Create buildx builder if it doesn't exist
echo -e "${YELLOW}Setting up buildx builder...${NC}"
if ! docker buildx inspect excalidash-builder > /dev/null 2>&1; then
    echo -e "${YELLOW}Creating new buildx builder...${NC}"
    docker buildx create --name excalidash-builder --use --bootstrap
else
    echo -e "${GREEN}✓ Using existing buildx builder${NC}"
    docker buildx use excalidash-builder
fi

# Build and push backend image (alpha only, no latest/dev tag)
echo ""
echo -e "${MAGENTA}Building and pushing backend alpha image...${NC}"
docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --tag $DOCKER_USERNAME/$IMAGE_NAME-backend:$VERSION \
    --file backend/Dockerfile \
    --push \
    backend/

echo -e "${GREEN}✓ Backend alpha image pushed successfully${NC}"

# Build and push frontend image (alpha only, no latest/dev tag)
echo ""
echo -e "${MAGENTA}Building and pushing frontend alpha image...${NC}"
docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --tag $DOCKER_USERNAME/$IMAGE_NAME-frontend:$VERSION \
    --build-arg VITE_APP_VERSION=$VERSION \
    --file frontend/Dockerfile \
    --push \
    .

echo -e "${GREEN}✓ Frontend alpha image pushed successfully${NC}"

echo ""
echo -e "${MAGENTA}===========================================${NC}"
echo -e "${GREEN}✓ Alpha images published!${NC}"
echo -e "${MAGENTA}===========================================${NC}"
echo ""
echo -e "${YELLOW}Images published:${NC}"
echo -e "  • $DOCKER_USERNAME/$IMAGE_NAME-backend:$VERSION"
echo -e "  • $DOCKER_USERNAME/$IMAGE_NAME-frontend:$VERSION"
echo ""
echo -e "${YELLOW}To use these images, update your docker-compose.yml:${NC}"
echo -e "  backend image: $DOCKER_USERNAME/$IMAGE_NAME-backend:$VERSION"
echo -e "  frontend image: $DOCKER_USERNAME/$IMAGE_NAME-frontend:$VERSION"
echo ""
