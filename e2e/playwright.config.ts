import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for E2E browser testing
 * 
 * Environment variables:
 * - BASE_URL: Frontend URL (default: http://localhost:5173)
 * - API_URL: Backend API URL (default: http://localhost:8000)
 * - HEADED: Run in headed mode (default: false)
 * - NO_SERVER: Skip starting servers (default: false)
 */
export default defineConfig({
  testDir: "./tests",

  // Run tests in parallel
  fullyParallel: false,

  // Fail the build on test.only() in CI
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Limit parallel workers in CI
  workers: process.env.CI ? 1 : 1,

  // Reporter configuration
  reporter: [
    ["list"],
    [
      "html",
      {
        // Useful when a previous Docker run produced root-owned artifacts.
        // Allows local runs to redirect output without editing the config.
        outputFolder: process.env.PLAYWRIGHT_REPORT_DIR || "playwright-report",
      },
    ],
  ],

  // Output folder for test artifacts
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || "test-results",

  // Global timeout for each test
  timeout: 60000,

  // Expect timeout
  expect: {
    timeout: 10000,
  },

  use: {
    // Base URL for page.goto()
    baseURL: process.env.BASE_URL || "http://127.0.0.1:5173",

    // Collect trace on first retry
    trace: "on-first-retry",

    // Screenshot on failure
    screenshot: "only-on-failure",

    // Video on failure
    video: "on-first-retry",

    // Headed mode based on env var
    headless: process.env.HEADED !== "true",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Viewport for consistent screenshots
        viewport: { width: 1280, height: 720 },
      },
    },
  ],

  // Run local dev servers before tests (skip if NO_SERVER or CI)
  webServer: undefined,
});
