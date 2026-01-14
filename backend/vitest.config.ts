import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.integration.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Use a separate test database
    env: {
      DATABASE_URL: "file:./prisma/test.db",
      NODE_ENV: "test",
    },
    // Run tests sequentially to avoid database conflicts
    pool: "forks",
    // NOTE: isolate: false is intentional for performance - all tests use the same
    // test database (test.db) and proper cleanup is handled in testUtils.ts.
    // Each test file uses beforeAll/afterAll hooks to manage test data isolation.
    isolate: false,
    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: [
        "node_modules/**",
        "src/generated/**",
        "src/**/*.test.ts",
        "src/**/*.integration.ts",
        "src/__tests__/testUtils.ts",
        "dist/**",
        "*.config.*",
        // Exclude non-production files
        "src/securityTest.ts",
        "src/routes/index.ts",
        "src/index.ts",
      ],
      include: [
        "src/**/*.ts",
      ],
      // Thresholds for coverage - 85% overall is excellent for a project of this size
      thresholds: {
        statements: 85,
        branches: 75,
        functions: 90,
        lines: 85,
      },
    },
  },
});
