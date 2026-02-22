# ExcaliDash E2E Tests

Browser-based end-to-end tests for ExcaliDash using Cypress + Cucumber (Gherkin).

## Prerequisites

- Node.js 18+
- npm
- Docker (optional, for containerized testing)

## Quick Start

### Local Testing

```bash
# Install dependencies
npm install

# Run tests (will start servers automatically)
npm test

# Run auth-tagged tests only
npm run test:auth

# Run tests with visible browser
npm run test:headed
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

# Or using docker compose directly
docker compose -f docker-compose.e2e.yml up --build --abort-on-container-exit
```

## Test Suites

Feature files live under `features/` and map to the core product areas:

- Drawing management (create/edit/delete/export)
- Dashboard workflows (bulk actions and collections)
- Search & sort
- Theme toggle
- Drag-and-drop + imports
- Export & import
- Collaboration
- Image persistence & security
- Collections management
- Library persistence
- System health

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
├── features/                 # Gherkin features
│   └── *.feature
├── cypress/                  # Cypress support + step definitions
│   ├── support/
│   └── step_definitions/
├── fixtures/                 # Test data files
│   └── small-image.excalidraw
├── cypress.config.ts         # Cypress configuration
├── docker-compose.e2e.yml    # Docker setup
├── Dockerfile.playwright     # Legacy Playwright container (to be removed)
├── run-e2e.sh                # Convenience script
└── README.md                 # This file
```

## Writing Tests

```gherkin
Feature: Example
  Scenario: View the dashboard
    Given the dashboard is open
    Then I should see the dashboard search input
```

```typescript
import { Given, Then } from "@badeball/cypress-cucumber-preprocessor";

Given("the dashboard is open", () => {
  cy.visit("/");
});

Then("I should see the dashboard search input", () => {
  cy.get('input[placeholder="Search drawings..."]').should("be.visible");
});
```

## Debugging

```bash
# Open Cypress UI
npm run test:headed

# View videos/screenshots after a run
npm run report
```

## CI Integration

The tests run in GitHub Actions. See `.github/workflows/test.yml`.
