import { defineConfig, devices } from "@playwright/test";

const FRONTEND_PORT = 26767;
const BACKEND_PORT = 28000;
const FRONTEND_URL =
  process.env.BASE_URL || `http://127.0.0.1:${FRONTEND_PORT}`;
const BACKEND_URL = process.env.API_URL || `http://127.0.0.1:${BACKEND_PORT}`;
const AUTHENTICATED = process.env.E2E_AUTH === "true";
const mode = AUTHENTICATED ? "authenticated" : "anonymous";
const frontendRuntimePort = new URL(FRONTEND_URL).port || "80";
const backendRuntimePort = new URL(BACKEND_URL).port || "80";
// Share resolved URLs with setup and API helpers, including custom local ports.
process.env.API_URL = BACKEND_URL;

/**
 * Playwright configuration for E2E browser testing
 *
 * Environment variables:
 * - BASE_URL: Frontend URL (default: http://127.0.0.1:26767)
 * - API_URL: Backend API URL (default: http://127.0.0.1:28000)
 * - HEADED: Run in headed mode (default: false)
 * - NO_SERVER: Skip starting servers (default: false)
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: AUTHENTICATED
    ? ["**/auth-workflows.spec.ts", "**/ui-review.spec.ts"]
    : "**/*.spec.ts",
  testIgnore: AUTHENTICATED
    ? []
    : ["**/auth-workflows.spec.ts", "**/ui-review.spec.ts"],

  globalSetup: AUTHENTICATED ? "./global-setup-auth" : "./global-setup",

  // The suite uses one backend SQLite database and performs broad cleanup by
  // naming convention, so running tests concurrently creates cross-test leaks.
  fullyParallel: false,

  forbidOnly: !!process.env.CI,

  retries: process.env.CI ? 2 : 0,

  workers: 1,

  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder:
          process.env.PLAYWRIGHT_REPORT_DIR || `playwright-report/${mode}`,
      },
    ],
  ],

  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || `test-results/${mode}`,

  timeout: 60000,

  expect: {
    timeout: 10000,
  },

  use: {
    baseURL: FRONTEND_URL,

    trace: "retain-on-failure",

    screenshot: "only-on-failure",

    video: "on-first-retry",

    headless: process.env.HEADED !== "true",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],

  webServer:
    process.env.NO_SERVER === "true"
      ? undefined
      : [
          {
            // Tests need a stable process, not a watcher that restarts when
            // another local build regenerates Prisma or writes artifacts.
            command:
              "cd ../backend && npm run predev && npx ts-node src/index.ts",
            url: `${BACKEND_URL}/health`,
            reuseExistingServer: process.env.E2E_REUSE_SERVER === "true",
            timeout: 120000,
            stdout: "pipe",
            stderr: "pipe",
            env: {
              DATABASE_URL: AUTHENTICATED
                ? "file:./auth-e2e.db"
                : "file:./e2e-test.db",
              PORT: backendRuntimePort,
              FRONTEND_URL,
              AUTH_MODE: AUTHENTICATED ? "local" : "disabled",
              S3_BUCKET: "",
              CSRF_MAX_REQUESTS: "100000",
              RATE_LIMIT_MAX_REQUESTS: "100000",
              CSRF_SECRET: "e2e-csrf-secret",
              JWT_SECRET: "e2e-jwt-secret-that-is-long-enough-for-tests",
            },
          },
          {
            command: `cd ../frontend && npm run dev -- --host 127.0.0.1 --port ${frontendRuntimePort}`,
            url: FRONTEND_URL,
            reuseExistingServer: process.env.E2E_REUSE_SERVER === "true",
            timeout: 120000,
            stdout: "pipe",
            stderr: "pipe",
            env: {
              VITE_DEV_BACKEND_URL: BACKEND_URL,
            },
          },
        ],
});
