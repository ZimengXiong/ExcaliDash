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
