import { defineConfig, devices } from "@playwright/test";

// Centralized test environment URLs
const FRONTEND_PORT = 5173;
const BACKEND_PORT = 8000;
const FRONTEND_URL = process.env.BASE_URL || `http://localhost:${FRONTEND_PORT}`;
const BACKEND_URL = process.env.API_URL || `http://localhost:${BACKEND_PORT}`;

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
  fullyParallel: true,
  
  // Fail the build on test.only() in CI
  forbidOnly: !!process.env.CI,
  
  // Retry on CI only
  retries: process.env.CI ? 2 : 0,
  
  // Limit parallel workers in CI
  workers: process.env.CI ? 1 : undefined,
  
  // Reporter configuration
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report" }],
  ],
  
  // Output folder for test artifacts
  outputDir: "test-results",
  
  // Global timeout for each test
  timeout: 60000,
  
  // Expect timeout
  expect: {
    timeout: 10000,
  },
  
  use: {
    // Base URL for page.goto()
    baseURL: FRONTEND_URL,
    
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
  webServer: (process.env.CI || process.env.NO_SERVER) ? undefined : [
    {
      command: "cd ../backend && npm run dev",
      url: `${BACKEND_URL}/health`,
      reuseExistingServer: true,
      timeout: 120000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        DATABASE_URL: "file:./prisma/dev.db",
        FRONTEND_URL,
      },
    },
    {
      command: "cd ../frontend && npm run dev -- --host",
      url: FRONTEND_URL,
      reuseExistingServer: true,
      timeout: 120000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
