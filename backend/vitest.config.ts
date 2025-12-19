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
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
