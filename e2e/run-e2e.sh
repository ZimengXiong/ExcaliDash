#!/bin/bash
# E2E Test Runner Script
# 
# Usage:
#   ./run-e2e.sh          # Run tests locally (starts servers automatically)
#   ./run-e2e.sh --headed # Run tests with visible browser
#   ./run-e2e.sh --docker # Run tests in Docker containers
#   ./run-e2e.sh --ci     # Run in CI mode (headless, servers already running)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Parse arguments
HEADED=""
DOCKER=""
CI=""
NO_SERVER=""

for arg in "$@"; do
  case $arg in
    --headed)
      HEADED="true"
      ;;
    --docker)
      DOCKER="true"
      ;;
    --ci)
      CI="true"
      NO_SERVER="true"
      ;;
    --no-server)
      NO_SERVER="true"
      ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: ./run-e2e.sh [--headed] [--docker] [--ci] [--no-server]"
      exit 1
      ;;
  esac
done

if [ "$DOCKER" = "true" ]; then
  echo "🐳 Running E2E tests in Docker..."
  docker compose -f docker-compose.e2e.yml up --build --abort-on-container-exit --exit-code-from cypress
  exit $?
fi

# Install dependencies if needed
CYPRESS_BIN="$SCRIPT_DIR/node_modules/.bin/cypress"
if [ ! -d "node_modules" ] || [ ! -x "$CYPRESS_BIN" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Run tests
echo "🧪 Running Cypress + Cucumber E2E tests..."
if [ "$HEADED" = "true" ]; then
  echo "   Mode: Headed (visible browser)"
  HEADED=true NO_SERVER=${NO_SERVER:-false} npm test
elif [ "$CI" = "true" ]; then
  echo "   Mode: CI (headless, no server startup)"
  CI=true NO_SERVER=true npm test
else
  echo "   Mode: Headless"
  NO_SERVER=${NO_SERVER:-false} npm test
fi

echo ""
echo "✅ E2E tests complete!"
echo "   Videos: cypress/videos"
echo "   Screenshots: cypress/screenshots"
