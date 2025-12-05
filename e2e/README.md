# ExcaliDash E2E Tests

Browser-based end-to-end tests for ExcaliDash using Playwright.

## Prerequisites

- Node.js 18+
- npm
- Docker (optional, for containerized testing)

## Quick Start

### Local Testing

```bash
# Install dependencies
npm install
npx playwright install chromium

# Run tests (will start servers automatically)
npm test

# Run tests with visible browser
npm run test:headed

# Run tests in debug mode
npm run test:debug
```

### With Existing Servers

If you already have the backend and frontend running:

```bash
# Backend at http://localhost:8000
# Frontend at http://localhost:5173
NO_SERVER=true npm test
```

### Docker Testing

Run tests in an isolated Docker environment:

```bash
npm run docker:test

# Or using docker-compose directly
docker-compose -f docker-compose.e2e.yml up --build --abort-on-container-exit
```

## Test Suites

### Image Persistence (Issue #17 Regression)

Tests for the bug where images wouldn't load fully when reopening files.

- **should preserve large image data through save/reload cycle** - Core regression test
- **should display drawing in editor view** - Browser UI test
- **should import .excalidraw file with embedded image** - File import test
- **should handle multiple images of varying sizes** - Multi-image test

### Security Tests

Tests for malicious content blocking:

- **should block javascript: URLs in image data** - XSS prevention
- **should block script tags in image data** - Script injection prevention

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:5173` | Frontend URL |
| `API_URL` | `http://localhost:8000` | Backend API URL |
| `HEADED` | `false` | Run with visible browser |
| `NO_SERVER` | `false` | Skip starting servers |
| `CI` | `false` | CI mode (headless, retries) |

## File Structure

```
e2e/
├── tests/                    # Test files
│   └── image-persistence.spec.ts
├── fixtures/                 # Test data files
│   └── small-image.excalidraw
├── playwright.config.ts      # Playwright configuration
├── docker-compose.e2e.yml    # Docker setup
├── Dockerfile.playwright     # Playwright container
├── run-e2e.sh               # Convenience script
└── README.md                # This file
```

## Writing Tests

```typescript
import { test, expect } from "@playwright/test";

test("my test", async ({ page, request }) => {
  // Use `page` for browser interactions
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  
  // Use `request` for API calls
  const response = await request.get("http://localhost:8000/drawings");
  expect(response.ok()).toBe(true);
});
```

## Debugging

```bash
# Run with Playwright UI
npm run test:ui

# Run specific test
npx playwright test -g "should preserve large image"

# Show last test report
npm run report
```

## CI Integration

The tests are integrated into GitHub Actions. See `.github/workflows/test.yml`.

For CI environments, tests run in headless mode with:
- Automatic retries on failure
- Screenshot/video on failure
- HTML report generation
